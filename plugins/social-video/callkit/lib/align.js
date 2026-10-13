// Where the known line is spoken in a clip, without a speech model.
//
// The line is known (it is the script the clip was generated from), so the job is alignment, not
// recognition: find the voiced stretches from the clip's energy, then place the words on them with a
// small dynamic programme that prefers to break at punctuation and keeps a steady speaking rate.
// Word edges come out within roughly a syllable, which is enough to light captions word by word and to
// cut pauses; where exact timing matters, pass measured `words` in the config instead.
const { readPcm } = require('./util');

const HOP = 0.01; // seconds per energy frame
const RATE_TOL = Math.log(1.45); // a phrase may run 45% faster or slower than the clip's pace for free
const SR = 16000;

function percentile(xs, p) {
  const s = Float64Array.from(xs).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

/** Pitch strength per hop: the normalised autocorrelation peak over 70-400 Hz (voiced speech is periodic, breath and room noise are not). */
function periodicity(x, hop) {
  const win = Math.round(0.03 * SR);
  const lo = Math.round(SR / 400);
  const hi = Math.round(SR / 70);
  const out = [];
  for (let i = 0; i + win + hi <= x.length; i += hop) {
    let e0 = 0;
    for (let k = 0; k < win; k++) e0 += x[i + k] * x[i + k];
    let best = 0;
    for (let lag = lo; lag <= hi; lag++) {
      let c = 0,
        e1 = 0;
      for (let k = 0; k < win; k++) {
        const b = x[i + k + lag];
        c += x[i + k] * b;
        e1 += b * b;
      }
      const r = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r > best) best = r;
    }
    out.push(best);
  }
  while (out.length < Math.floor(x.length / hop)) out.push(0);
  return out;
}

/**
 * Speech stretches [{start, end}]: loud enough above the clip's floor and periodic nearby, so a long
 * sigh, a breath or the room after the line is not mistaken for words.
 */
async function speechSegments(file) {
  const x = await readPcm(file, SR, 1, 'highpass=f=70,lowpass=f=3800');
  const hop = Math.round(HOP * SR);
  const db = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + hop; k++) e += x[k] * x[k];
    db.push(10 * Math.log10(e / hop + 1e-12));
  }
  const sm = db.map((_, i) => {
    let s = 0,
      n = 0;
    for (let k = Math.max(0, i - 1); k <= Math.min(db.length - 1, i + 1); k++) ((s += db[k]), n++);
    return s / n;
  });
  const pitch = periodicity(x, hop);
  const floor = percentile(sm, 8);
  const peak = percentile(sm, 97);
  const hold = Math.max(floor + 6, floor + 0.25 * (peak - floor));
  const loudVoiced = Math.max(floor + 9, floor + 0.35 * (peak - floor));
  // Voiced frames, widened by 120 ms so unvoiced consonants at word edges ("s", "t", "f") stay in.
  const voiced = sm.map((v, i) => v > loudVoiced && pitch[i] > 0.6);
  const near = voiced.map((_, i) => {
    for (let k = Math.max(0, i - 12); k <= Math.min(voiced.length - 1, i + 12); k++)
      if (voiced[k]) return true;
    return false;
  });
  let segs = [];
  let a = -1;
  for (let i = 0; i <= sm.length; i++) {
    const on = i < sm.length && near[i] && sm[i] > hold;
    if (on && a < 0) a = i;
    if (!on && a >= 0) {
      segs.push({ start: a * HOP, end: i * HOP });
      a = -1;
    }
  }
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < 0.16) last.end = s.end;
    else merged.push({ ...s });
  }
  segs = merged
    .map((s) => {
      const i0 = Math.round(s.start / HOP),
        i1 = Math.round(s.end / HOP);
      let v = 0;
      for (let i = i0; i < i1; i++) v += voiced[i] ? 1 : 0;
      const level = sm.slice(i0, i1).sort((p, q) => p - q);
      return {
        ...s,
        voicedFraction: +(v / Math.max(1, i1 - i0)).toFixed(2),
        db: +level[level.length >> 1].toFixed(1),
      };
    })
    .filter((s) => s.end - s.start >= 0.1 && s.voicedFraction >= 0.15);
  return { segments: segs, floorDb: floor, peakDb: peak, duration: x.length / SR };
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 1;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (n > 1 && /[^aeiouy]e$/.test(w) && !/le$/.test(w)) n--;
  return Math.max(1, n);
}
const breaks = (w) => /[.,!?;:…—-]["')\]]*$/.test(w);
const ends = (w) => /[.!?…]["')\]]*$/.test(w);

/**
 * Words of `text` placed on `segments`: [{text, start, end}], plus the segments nothing was placed on
 * (breaths, or Veo talking past the script).
 */
function alignWords(text, segments) {
  const words = text.split(/\s+/).filter(Boolean);
  const n = words.length;
  const m = segments.length;
  if (!n) throw new Error('Clip text is empty.');
  if (!m) throw new Error('No speech found in the clip; pass measured "words" in the config.');
  const syl = words.map(syllables);
  const cum = [0];
  for (const s of syl) cum.push(cum[cum.length - 1] + s);
  const voiced = segments.map((s) => s.end - s.start);
  let rate = 0.2; // seconds per syllable: an unhurried conversational pace, re-estimated below
  let best;
  for (let pass = 0; pass < 3; pass++) {
    // dp[i][j]: cost of placing the first i words on the first j segments.
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
    dp[0][0] = 0;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j < m; j++) {
        if (dp[i][j] === Infinity) continue;
        // Leave segment j unworded. Veo breathes or hums before the line and often keeps talking past
        // it, so edges are cheap; a voiced stretch in the middle of the line is almost always words.
        const seg = segments[j];
        // Talk past the line usually follows a clear pause; sound right on the line's heels is the line.
        const after = j > 0 ? seg.start - segments[j - 1].end : Infinity;
        const tail = (back[i][j]?.skip ? 0.2 : after >= 0.35 ? 0.5 : 1.2) + 0.05 * voiced[j]; // once past the line, stay past it
        const edge = i === 0 ? 0.8 + 0.2 * voiced[j] : i === n ? tail : Infinity;
        const weak =
          seg.voicedFraction < 0.35 || voiced[j] < 0.3 ? 0.8 + 0.5 * voiced[j] : 2.5 + voiced[j];
        const skip = dp[i][j] + Math.min(edge, weak);
        if (skip < dp[i][j + 1]) ((dp[i][j + 1] = skip), (back[i][j + 1] = { i, j, skip: true }));
        if (i === n) continue;
        let v = 0;
        for (let b = j + 1; b <= Math.min(m, j + 5); b++) {
          v += voiced[b - 1];
          for (let a = i + 1; a <= n; a++) {
            const want = rate * (cum[a] - cum[i]);
            if (want > v * 3 + 1) break;
            // Free within the band of ordinary delivery, steep outside it.
            const off = Math.abs(Math.log(Math.max(v, 0.05) / Math.max(want, 0.12))) - RATE_TOL;
            let c = off > 0 ? 8 * off * off : 0;
            // A pause should fall at punctuation, preferably the end of a sentence.
            if (a < n) c += ends(words[a - 1]) ? 0 : breaks(words[a - 1]) ? 0.35 : 0.9;
            c += 0.5 * (b - j - 1); // and a phrase should rarely span a pause
            for (let k = j; k < b - 1; k++)
              if (segments[k + 1].start - segments[k].end > 0.5) c += 1.5;
            const total = dp[i][j] + c;
            if (total < dp[a][b]) ((dp[a][b] = total), (back[a][b] = { i, j, skip: false }));
          }
        }
      }
    let i = n,
      j = m;
    const groups = [];
    const skipped = [];
    while (i > 0 || j > 0) {
      const p = back[i][j];
      if (!p) throw new Error('Could not align the line to the clip; pass measured "words".');
      if (p.skip) skipped.push(segments[p.j]);
      else groups.unshift({ words: [p.i, i], segs: [p.j, j] });
      ((i = p.i), (j = p.j));
    }
    let v = 0,
      s = 0;
    for (const g of groups) {
      for (let k = g.segs[0]; k < g.segs[1]; k++) v += voiced[k];
      s += cum[g.words[1]] - cum[g.words[0]];
    }
    // Keep the rate plausible (about 3-8 syllables a second) so one bad fit cannot run away.
    rate = Math.min(0.23, Math.max(0.17, v / s));
    best = { groups, skipped };
  }
  // Within a group, share its voiced time out by syllables, skipping the silences inside it.
  const out = [];
  for (const g of best.groups) {
    const segs = segments.slice(g.segs[0], g.segs[1]);
    const total = segs.reduce((a, x) => a + x.end - x.start, 0);
    const at = (offset) => {
      let o = offset;
      for (const x of segs) {
        if (o <= x.end - x.start + 1e-9) return x.start + o;
        o -= x.end - x.start;
      }
      return segs[segs.length - 1].end;
    };
    const span = cum[g.words[1]] - cum[g.words[0]];
    for (let w = g.words[0]; w < g.words[1]; w++) {
      const a = ((cum[w] - cum[g.words[0]]) / span) * total;
      const b = ((cum[w + 1] - cum[g.words[0]]) / span) * total;
      out.push({ text: words[w], start: +at(a).toFixed(3), end: +at(b).toFixed(3) });
    }
  }
  return { words: out, skipped: best.skipped.sort((a, b) => a.start - b.start), rate };
}

/** Speech analysis of one clip against its known line. */
async function analyseClip(file, text, measuredWords) {
  const sp = await speechSegments(file);
  if (measuredWords?.length)
    return {
      ...sp,
      words: measuredWords.map((w) => ({ text: w.text, start: +w.start, end: +w.end })),
      skipped: [],
      measured: true,
    };
  const al = alignWords(text, sp.segments);
  return { ...sp, words: al.words, skipped: al.skipped, measured: false };
}

module.exports = { speechSegments, alignWords, analyseClip, syllables, ends };

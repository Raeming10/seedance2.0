// The call as a run of pieces cut from the clips, with caption pages on the call's own timeline.
//
// Veo leaves 1.5-4 s of silence between sentences; a hook cannot afford that. Every pause longer than
// maxGap is cut down to about 0.8 s: a hard cut, with a 9% punch-in on every other cut (the talking-head
// jump-cut grammar) and an equal-power crossfade in the sound inside the pause.
const { FPS, round } = require('./util');

const PUNCH = 1.09;
const XF = 0.24; // crossfade across a cut inside a pause, so room tone never jumps
const CLIP_JOIN_XF = 0.16; // where one clip's room ends and the next clip's begins
const MAX_GAP = 1.05;

/** One clip -> pieces [{from,to,frames,xf,dissolve}], words remapped to the cut, and its length. */
function planClip(info, opts) {
  const { lead, tail, timing = {} } = opts;
  const full = info.words;
  const drop = new Set(opts.drop || []);
  const w = full.filter((_, i) => !drop.has(i));
  const first = w[0].start;
  const last = w[w.length - 1].end;
  // Veo's frame 0 twitches: never start before frame 2.
  let start = Math.max(2 / 24, first - lead);
  if (timing.wordHeadroom !== undefined)
    start = Math.min(start, Math.max(0, first - timing.wordHeadroom));
  // Stop before Veo talks past the line (sound about as loud as the line itself), and before the clip
  // runs out; a quieter hum or breath after the line is part of his last look and stays.
  const worded = info.segments
    .filter((s) => w.some((x) => x.start < s.end && x.end > s.start))
    .map((s) => s.db)
    .sort((a, b) => a - b);
  const lineDb = worded.length ? worded[worded.length >> 1] : -20;
  const extra = info.skipped.find((s) => s.start > last + 0.15 && (s.db ?? 0) > lineDb - 8);
  const limit = Math.min(info.duration - 0.05, extra ? extra.start - 0.12 : Infinity);
  const end = Math.max(last + 0.12, Math.min(limit, last + tail));
  const cuts = [];
  // A flubbed word (a stutter) is cut out right at the word edges with a short crossfade.
  full.forEach((x, i) => {
    if (!drop.has(i)) return;
    const next = full.slice(i + 1).find((_, k) => !drop.has(i + 1 + k));
    if (next) cuts.push({ a: x.start - 0.02, b: next.start - 0.05, xf: 0.03 });
  });
  const maxGap = timing.maxGap ?? MAX_GAP;
  const keepOut = timing.pauseOut ?? 0.42; // seconds of the pause kept after the sentence
  const keepIn = timing.pauseIn ?? 0.38; // and before the next one starts
  for (let i = 0; i < w.length - 1; i++) {
    const e = w[i].end;
    const s = w[i + 1].start;
    if (s - e > maxGap && !cuts.some((c) => c.a >= e && c.a <= s))
      cuts.push({ a: e + keepOut, b: s - keepIn, xf: XF });
  }
  cuts.sort((x, y) => x.a - y.a);
  const bounds = [];
  let cur = start;
  const xfs = [XF];
  for (const c of cuts) {
    bounds.push([cur, c.a]);
    cur = c.b;
    xfs.push(c.xf);
  }
  bounds.push([cur, end]);
  const pieces = [];
  let t = 0;
  bounds.forEach(([a, b], k) => {
    const frames = Math.max(1, Math.round((b - a) * FPS));
    pieces.push({
      from: round(a, 4),
      to: round(a + frames / FPS, 4),
      frames,
      xf: xfs[k],
      dissolve: false,
      at: round(t, 4),
    });
    t += frames / FPS;
  });
  const remap = (x) => {
    for (const pc of pieces)
      if (x >= pc.from - 1e-6 && x <= pc.to + 1e-6) return pc.at + (x - pc.from);
    // A word edge inside a removed pause snaps to the nearest kept edge.
    let best = pieces[0],
      d = Infinity;
    for (const pc of pieces) {
      const dd = Math.min(Math.abs(x - pc.from), Math.abs(x - pc.to));
      if (dd < d) ((d = dd), (best = pc));
    }
    return best.at + (Math.abs(x - best.from) < Math.abs(x - best.to) ? 0 : best.to - best.from);
  };
  const words = w.map((x) => ({
    text: x.text,
    start: round(remap(x.start)),
    end: round(remap(x.end)),
  }));
  return { pieces, words, seconds: t };
}

const joined = (ws) => ws.map((x) => x.text).join(' ');

/** One sentence -> pages of at most ~limit characters, split where the halves balance (commas preferred). */
function split(ws, limit = 44) {
  if (joined(ws).length <= limit || ws.length < 2) return [ws];
  const joins = new Set(['and', 'but', 'so', 'or', "'cause"]);
  let best = 1,
    score = Infinity;
  for (let i = 1; i < ws.length; i++) {
    const s =
      Math.abs(joined(ws.slice(0, i)).length - joined(ws.slice(i)).length) -
      (ws[i - 1].text.endsWith(',') ? 14 : 0) -
      (joins.has(ws[i].text.toLowerCase()) ? 6 : 0);
    if (s < score) ((score = s), (best = i));
  }
  return [...split(ws.slice(0, best), limit), ...split(ws.slice(best), limit)];
}

/** Caption pages: one per sentence (long ones split); the last stays up until the call cuts away. */
function pagesFor(words, segEnd) {
  const sentences = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (/[.?!…]["')]*$/.test(w.text)) (sentences.push(cur), (cur = []));
  }
  if (cur.length) sentences.push(cur);
  const pages = sentences.flatMap((s) => split(s));
  return pages.map((pg, i) => {
    let end = i + 1 < pages.length ? pg[pg.length - 1].end + 0.25 : segEnd;
    if (i + 1 < pages.length) end = Math.min(end, pages[i + 1][0].start - 0.36);
    return { start: pg[0].start, end: round(end), words: pg };
  });
}

/**
 * The whole call across the clips. `hook` (the call opens the video) leaves him a shorter look before his
 * first word than an intro that lands on the call does.
 */
function planCall(clips, { hook, timing = {}, punch = PUNCH }) {
  const pieces = [];
  const pages = [];
  let t = 0;
  let hard = 0;
  clips.forEach((clip, k) => {
    const firstClip = k === 0;
    const lastClip = k === clips.length - 1;
    const lead = firstClip ? (timing.lead ?? (hook ? 0.35 : 0.45)) : (timing.betweenLead ?? 0.25);
    const tail = lastClip ? (timing.tail ?? 0.95) : (timing.betweenTail ?? 0.35);
    const plan = planClip(clip.info, { lead, tail, timing, drop: clip.drop });
    plan.pieces.forEach((pc, j) => {
      if (j === 0 && k > 0) {
        pc.dissolve = false; // a new clip is a new take: cut, never blend
        pc.xf = CLIP_JOIN_XF;
      }
      if (k > 0 || j > 0) hard += 1;
      pc.zoom = hard % 2 ? punch : 1.0;
      pc.video = clip.publicPath;
      pc.origin = clip.origin;
      pc.src = clip.video;
      pieces.push(pc);
    });
    for (const pg of pagesFor(plan.words, plan.seconds))
      pages.push({
        start: round(pg.start + t),
        end: round(pg.end + t),
        words: pg.words.map((w) => ({
          text: w.text,
          start: round(w.start + t),
          end: round(w.end + t),
        })),
      });
    t += plan.seconds;
  });
  return { pieces, pages, seconds: t, frames: pieces.reduce((n, p) => n + p.frames, 0) };
}

/** Explicit cinematic edit: retain actions/silence and map measured words, never auto-trim a scene. */
function planStory(clips) {
  const pieces = [],
    pages = [];
  let frames = 0;
  for (const [i, clip] of clips.entries()) {
    const start = clip.start ?? 0;
    const end = clip.end ?? clip.info.duration;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > clip.info.duration + 0.02
    )
      throw new Error(`clips[${i}]: invalid source range.`);
    const count = Math.round((end - start) * FPS);
    if (count < 1) throw new Error(`clips[${i}]: keep at least one frame.`);
    const words = clip.info.words;
    if (!Array.isArray(words) || (clip.text && !words.length))
      throw new Error(
        `clips[${i}]: story captions need measured source-time words; do not guess from script.`,
      );
    let previousEnd = 0;
    for (const w of words) {
      if (
        !w.text ||
        !Number.isFinite(w.start) ||
        !Number.isFinite(w.end) ||
        w.start < previousEnd - 0.001 ||
        w.end <= w.start ||
        w.end > clip.info.duration + 0.02
      )
        throw new Error(`clips[${i}]: invalid source-time word.`);
      previousEnd = w.end;
      if ((w.start < start && w.end > start) || (w.start < end && w.end > end))
        throw new Error(`clips[${i}]: selection cuts through a spoken word.`);
    }
    const at = frames / FPS;
    const seconds = count / FPS;
    const kept = words
      .filter((w) => w.start >= start && w.end <= end)
      .map((w) => ({ ...w, start: w.start - start, end: w.end - start }));
    for (const pg of pagesFor(kept, seconds))
      pages.push({
        start: pg.start + at,
        end: Math.min(pg.end, pg.words[pg.words.length - 1].end + 0.25) + at,
        words: pg.words.map((w) => ({ ...w, start: w.start + at, end: w.end + at })),
      });
    pieces.push({
      from: start,
      to: start + seconds,
      frames: count,
      at,
      xf: 0,
      dissolve: false,
      zoom: 1,
      video: clip.publicPath,
      src: clip.video,
      origin: clip.origin,
    });
    frames += count;
  }
  return { pieces, pages, frames, seconds: frames / FPS };
}

module.exports = { planCall, planClip, planStory, pagesFor, PUNCH, XF };

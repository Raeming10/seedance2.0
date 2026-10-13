// The video's sound: his voice cut exactly like the picture, the brand music bed under it (up while an
// intro plays, ducked under his voice, full into the end card), his room carried across the joins, and
// the UI sounds (ring, taps, message pops), which are synthesised here so no one's ringtone is used.
const fs = require('node:fs');
const path = require('node:path');
const { FPS, SR, ffmpeg, readPcm, writeWav, loudness } = require('./util');
const { XF } = require('./plan');

const DIP = 7 / FPS; // the picture's dip to black before the end card
const DUCK = -14; // dB of the bed under his voice
const OVER = 0.35; // the bed runs on this far into the end card, fading under its own music

/** The call's sound, cut like the picture, crossfading inside every removed pause and clip join. */
async function cutCallAudio(pieces, dst, fadeIn = 0.25, fadeOut = 0.6) {
  const raw = new Map();
  for (const pc of pieces) if (!raw.has(pc.src)) raw.set(pc.src, await readPcm(pc.src, SR, 2));
  const lens = pieces.map((pc) => Math.round((pc.frames / FPS) * SR));
  const total = lens.reduce((a, b) => a + b, 0);
  const out = new Float32Array(total * 2);
  let at = 0;
  pieces.forEach((pc, k) => {
    const y = raw.get(pc.src);
    const n = lens[k];
    const pre = k > 0 ? Math.floor(((pc.xf ?? XF) * SR) / 2) : 0;
    const post = k < pieces.length - 1 ? Math.floor(((pieces[k + 1].xf ?? XF) * SR) / 2) : 0;
    const a = Math.round(pc.from * SR) - pre;
    const len = pre + n + post;
    for (let s = 0; s < len; s++) {
      const src = a + s;
      if (src < 0 || src * 2 + 1 >= y.length) continue;
      let g = 1;
      if (pre && s < 2 * pre) g *= Math.sin((s / (2 * pre)) * (Math.PI / 2));
      if (post && s >= len - 2 * post)
        g *= Math.cos(((s - (len - 2 * post)) / (2 * post)) * (Math.PI / 2));
      const o = at - pre + s;
      if (o < 0 || o >= total) continue;
      out[o * 2] += y[src * 2] * g;
      out[o * 2 + 1] += y[src * 2 + 1] * g;
    }
    at += n;
  });
  const fi = Math.min(total, Math.round(fadeIn * SR));
  const fo = Math.min(total, Math.round(fadeOut * SR));
  for (let s = 0; s < fi; s++) {
    const g = Math.sin((s / fi) * (Math.PI / 2));
    ((out[s * 2] *= g), (out[s * 2 + 1] *= g));
  }
  for (let s = 0; s < fo; s++) {
    const i = total - fo + s;
    const g = Math.cos((s / fo) * (Math.PI / 2));
    ((out[i * 2] *= g), (out[i * 2 + 1] *= g));
  }
  return writeWav(dst, out);
}

/** One chain and one gain for the whole call, so he sounds the same throughout. Returns the gain (dB). */
async function levelVoice(src, dst, target = -14.5) {
  const shaped = dst.replace(/\.wav$/, '_shaped.wav');
  await ffmpeg([
    '-v',
    'error',
    '-i',
    src,
    '-af',
    `highpass=f=55,bass=g=2:f=130:w=0.7,acompressor=threshold=-24dB:ratio=2.2:attack=10:release=180,aresample=${SR}`,
    '-c:a',
    'pcm_f32le',
    shaped,
  ]);
  const gain = target - (await loudness(shaped));
  await ffmpeg([
    '-v',
    'error',
    '-i',
    shaped,
    '-af',
    `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`,
    '-c:a',
    'pcm_f32le',
    dst,
  ]);
  return gain;
}

/** A loop of a clip's quietest speech-free stretch: his room, carried a moment past the call. */
async function roomTone(src, info, seconds, gainDb, dst) {
  const y = await readPcm(src, SR, 2);
  const w = info.words;
  const gaps = [[0.05, w[0].start - 0.12]];
  for (let i = 0; i + 1 < w.length; i++) gaps.push([w[i].end + 0.12, w[i + 1].start - 0.12]);
  gaps.push([w[w.length - 1].end + 0.3, info.duration - 0.05]);
  // Not where Veo talks past the line.
  const clear = gaps.map(([a, b]) => {
    for (const s of info.skipped) if (s.start < b && s.end > a) b = Math.min(b, s.start - 0.05);
    return [a, b];
  });
  const [a, b] = clear.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best));
  let seg = y.subarray(Math.max(0, Math.round(a * SR)) * 2, Math.max(0, Math.round(b * SR)) * 2);
  if (seg.length < 0.3 * SR * 2) seg = new Float32Array(Math.round(0.3 * SR) * 2);
  const xf = Math.min(Math.round(0.08 * SR), Math.floor(seg.length / 2 / 3));
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n * 2);
  const g = 10 ** (gainDb / 20);
  const L = seg.length / 2;
  let pos = 0;
  while (pos < n) {
    for (let s = 0; s < L && pos + s < n; s++) {
      let k = 1;
      if (pos > 0 && s < xf) k = s / xf; // crossfade into the next repeat
      if (s >= L - xf && pos + L < n) k *= (L - s) / xf;
      out[(pos + s) * 2] += seg[s * 2] * g * k;
      out[(pos + s) * 2 + 1] += seg[s * 2 + 1] * g * k;
    }
    pos += L - xf;
  }
  return writeWav(dst, out);
}

// ── UI sounds ────────────────────────────────────────────────────────────────────────────────

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(seconds, seed) {
  const r = rng(seed);
  return Float64Array.from({ length: Math.round(seconds * SR) }, () => {
    const u = Math.max(1e-9, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  });
}
/** A struck, marimba-like note. */
function tone(
  freq,
  seconds,
  decay,
  partials = [
    [1, 1],
    [4, 0.18],
    [10, 0.05],
  ],
) {
  const n = Math.round(seconds * SR);
  const atk = Math.min(n, Math.round(0.004 * SR));
  return Float64Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    let v = 0;
    for (const [m, a] of partials)
      v += a * Math.sin(2 * Math.PI * freq * m * t) * Math.exp(-t * decay * (1 + 0.6 * m));
    return i < atk ? (v * i) / atk : v;
  });
}
function sweep(f0, f1, seconds, decay) {
  const n = Math.round(seconds * SR);
  let ph = 0;
  const atk = Math.round(0.003 * SR);
  return Float64Array.from({ length: n }, (_, i) => {
    ph += (2 * Math.PI * f0 * (f1 / f0) ** (i / Math.max(1, n - 1))) / SR;
    const v = Math.sin(ph) * Math.exp((-i / SR) * decay);
    return i < atk ? (v * i) / atk : v;
  });
}
const scale = (xs, g) => xs.map((v) => v * g);
function addAt(dst, src, at) {
  for (let i = 0; i < src.length && at + i < dst.length; i++) dst[at + i] += src[i];
  return dst;
}
function ring() {
  // A soft rising three-note chime, twice: an incoming call without anyone's ringtone.
  const out = new Float64Array(Math.round(1.3 * SR));
  for (const [at, f] of [
    [0, 1046.5],
    [0.13, 1318.5],
    [0.26, 1568],
    [0.55, 1318.5],
    [0.68, 1568],
  ])
    addAt(out, tone(f, 0.6, 7), Math.round(at * SR));
  return scale(out, 0.22);
}
const SFX = {
  ring,
  tap: () => {
    const s = sweep(2400, 1500, 0.035, 90);
    const nz = noise(0.035, 1);
    return s.map((v, i) => 0.22 * (v + 0.4 * nz[i] * Math.exp((-i / SR) * 160)));
  },
  connect: () => {
    const a = tone(659.3, 0.12, 12).subarray(0, Math.round(0.09 * SR));
    const b = tone(987.8, 0.5, 9);
    const out = new Float64Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return scale(out, 0.16);
  },
  sent: () => scale(sweep(520, 1250, 0.09, 30), 0.12),
  pop: () =>
    scale(
      tone(880, 0.22, 26, [
        [1, 1],
        [2, 0.25],
      ]),
      0.16,
    ),
  whoosh: () => {
    const nz = noise(0.3, 2);
    return nz.map((v, i) => 0.05 * v * Math.sin((Math.PI * i) / nz.length) ** 2);
  },
};

/** Every UI sound of the video on one stereo track: events [[name, seconds], ...]. */
function sfxTrack(events, seconds, dst) {
  const mono = new Float64Array(Math.round(seconds * SR));
  for (const [name, at] of events) addAt(mono, SFX[name](), Math.round(Math.max(0, at) * SR));
  const out = new Float32Array(mono.length * 2);
  mono.forEach((v, i) => {
    out[i * 2] = v;
    out[i * 2 + 1] = v;
  });
  return writeWav(dst, out);
}

// ── the mix ──────────────────────────────────────────────────────────────────────────────────

/** Piecewise-linear gain in dB over t for ffmpeg's volume filter, holding both ends. */
function curve(points) {
  let expr = String(points[points.length - 1][1]);
  for (let k = points.length - 2; k >= 0; k--) {
    const [ta, da] = points[k];
    const [tb, db] = points[k + 1];
    expr = `if(lt(t,${tb.toFixed(3)}),${da}+(${db}-(${da}))*(t-${ta.toFixed(3)})/${Math.max(tb - ta, 1e-3).toFixed(3)},${expr})`;
  }
  return `if(lt(t,${points[0][0].toFixed(3)}),${points[0][1]},${expr})`;
}

/** The bed's level over the video, by format. */
function bedPoints(format, total, callFrom, callTo) {
  const end = [
    [total - 1.1, DUCK],
    [total - DIP, 0],
    [total, 0],
    [total + OVER, -40],
  ];
  if (format === 'cards-first')
    return [[0, 0], [callFrom - 0.8, 0], [callFrom + 0.1, DUCK], ...end];
  if (format === 'call-first')
    return [
      [0, DUCK],
      [callTo - 0.45, DUCK],
      [callTo + 0.6, 0],
      [total, 0],
      [total + OVER, -40],
    ];
  const intro = { incoming: -10, chat: -5 }[format] ?? DUCK;
  const pts = [[0, intro]];
  if (callFrom > 0) pts.push([callFrom - 0.6, intro], [callFrom + 0.1, DUCK]);
  return [...pts, ...end];
}

/**
 * Voice at the call, bed under everything, room tone across the call's edge, UI sounds on top, then the
 * end card's own sound where its picture starts. `music.period` (seconds per 8 beats) lands the bed on
 * the end card's beat so the song runs straight on.
 */
async function mix({ format, total, callFrom, callTo, voice, room, sfx, music, endCard, workdir }) {
  const ins = ['-i', voice];
  let graph = `[0]adelay=${Math.round(callFrom * 1000)}:all=1,apad[v];`;
  const streams = ['[v]'];
  if (music) {
    const beat = music.period ? music.period / 8 : 0;
    const shift = beat ? ((((music.phase ?? 0.137) - total) % beat) + beat) % beat : 0;
    ins.push('-stream_loop', '-1', '-ss', shift.toFixed(4), '-i', music.file);
    graph += `[${streams.length}]atrim=0:${(total + OVER + 0.5).toFixed(3)},volume=${music.gainDb ?? -1.5}dB,volume='pow(10,(${curve(bedPoints(format, total, callFrom, callTo))})/20)':eval=frame[m];`;
    streams.push('[m]');
  }
  if (sfx) {
    ins.push('-i', sfx);
    graph += `[${streams.length}]apad[s];`;
    streams.push('[s]');
  }
  if (room) {
    ins.push('-i', room.file);
    const at = Math.max(0, room.at);
    graph += `[${streams.length}]${room.fade},adelay=${Math.round(at * 1000)}:all=1,apad[r];`;
    streams.push('[r]');
  }
  const main = path.join(workdir, 'main_mix.wav');
  const tailS = endCard ? OVER : 0.05;
  await ffmpeg([
    '-v',
    'error',
    ...ins,
    '-filter_complex',
    `${graph}${streams.join('')}amix=inputs=${streams.length}:normalize=0:duration=longest,atrim=0:${(total + tailS).toFixed(4)},alimiter=limit=0.93:level=false[o]`,
    '-map',
    '[o]',
    '-ar',
    String(SR),
    '-ac',
    '2',
    '-c:a',
    'pcm_f32le',
    main,
  ]);
  if (!endCard) return main;
  const full = path.join(workdir, 'mix.wav');
  const ec = Math.round(total * 1000);
  await ffmpeg([
    '-v',
    'error',
    '-i',
    main,
    '-i',
    endCard,
    '-filter_complex',
    `[1:a]aresample=${SR},adelay=${ec}:all=1[e];[0][e]amix=inputs=2:normalize=0:duration=longest[o]`,
    '-map',
    '[o]',
    '-ar',
    String(SR),
    '-ac',
    '2',
    '-c:a',
    'pcm_f32le',
    full,
  ]);
  return full;
}

/** The picture, then the untouched end card, over the full mix, encoded for upload. */
async function mux(main, endCard, audio, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const v = endCard
    ? [
        '-i',
        main,
        '-i',
        endCard,
        '-i',
        audio,
        '-filter_complex',
        '[0:v]fps=30,format=yuv420p,setsar=1[v0];[1:v]fps=30,scale=1080:1920,format=yuv420p,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
        '-map',
        '[v]',
        '-map',
        '2:a',
      ]
    : ['-i', main, '-i', audio, '-map', '0:v', '-map', '1:a'];
  await ffmpeg([
    '-v',
    'error',
    ...v,
    '-c:v',
    'libx264',
    '-crf',
    '17',
    '-maxrate',
    '11M',
    '-bufsize',
    '22M',
    '-preset',
    'slow',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    '-shortest',
    out,
  ]);
  return out;
}

module.exports = { cutCallAudio, levelVoice, roomTone, sfxTrack, mix, mux, curve, bedPoints, DIP };

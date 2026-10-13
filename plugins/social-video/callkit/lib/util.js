// Process, audio-sample and file helpers. Everything here uses Node built-ins plus FFmpeg on PATH.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE =
  process.env.FFPROBE_PATH ||
  (process.env.FFMPEG_PATH
    ? path.join(path.dirname(process.env.FFMPEG_PATH), 'ffprobe')
    : 'ffprobe');
const FPS = 30;
const SR = 48000;

/** Run a program; resolve with {stdout (Buffer), stderr (string)}, reject with the tail of stderr. */
function run(program, args, { cwd, input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      env: env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    let err = '';
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => {
      err = (err + b).slice(-20000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve({ stdout: Buffer.concat(out), stderr: err })
        : reject(new Error(`${path.basename(program)} exited ${code}: ${err.slice(-3000)}`)),
    );
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

const ffmpeg = (args, opts) => run(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], opts);

async function duration(file) {
  const { stdout } = await run(FFPROBE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  return Number(String(stdout).trim());
}

/** Decoded samples as Float32Array (interleaved when channels > 1). */
async function readPcm(file, sr, channels, filter) {
  const tracks = await run(FFPROBE, [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    file,
  ]);
  if (!String(tracks.stdout).trim())
    return new Float32Array(Math.round((await duration(file)) * sr) * channels);
  const { stdout } = await ffmpeg([
    '-v',
    'error',
    '-i',
    file,
    '-vn',
    ...(filter ? ['-af', filter] : []),
    '-ac',
    String(channels),
    '-ar',
    String(sr),
    '-f',
    'f32le',
    '-',
  ]);
  return new Float32Array(stdout.buffer, stdout.byteOffset, stdout.length / 4);
}

/** Interleaved stereo float samples -> 32-bit float WAV. */
function writeWav(file, samples, sr = SR, channels = 2) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.length * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * channels * 4, 28);
  h.writeUInt16LE(channels * 4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
  return file;
}

/** Integrated loudness (LUFS). */
async function loudness(file) {
  const { stderr } = await ffmpeg(['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  if (!m.length) throw new Error('Could not measure loudness of ' + file);
  return Number(m[m.length - 1][1]);
}

/** Place a file where Remotion's static server can read it (it does not follow symlinks). */
function place(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) {
    const a = fs.statSync(src);
    const b = fs.statSync(dst);
    if (a.ino === b.ino && a.dev === b.dev) return dst;
    fs.rmSync(dst);
  }
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
  return dst;
}

const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

module.exports = {
  FFMPEG,
  FFPROBE,
  FPS,
  SR,
  run,
  ffmpeg,
  duration,
  readPcm,
  writeWav,
  loudness,
  place,
  round,
};

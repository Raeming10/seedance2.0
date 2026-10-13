// Remotion draws the picture, muted, as a frame sequence. Chrome now and then hands back a screenshot
// with raster tiles still black, so every frame is checked against its neighbours and any such frame is
// drawn again on its own before the sequence is encoded.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FPS, ffmpeg, run } = require('./util');

const KIT = path.resolve(__dirname, '..');
const COMPOSITION = 'PreluluCall';

function remotionBin() {
  const bin = path.join(
    KIT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'remotion.cmd' : 'remotion',
  );
  if (!fs.existsSync(bin))
    throw new Error('The call kit is not installed. Run the launcher: callkit setup.');
  return bin;
}

function browserArgs() {
  const b = process.env.CALLKIT_BROWSER_EXECUTABLE;
  // A busy machine can take far longer than Remotion's 30 s default to load a frame's video and font.
  return ['--timeout=120000', ...(b ? [`--browser-executable=${b}`] : [])];
}

const common = () => [path.join(KIT, 'src', 'index.ts'), COMPOSITION];

const remotion = (args) => run(remotionBin(), args, { cwd: KIT });

/** Frames where a block went black that is lit in both neighbours, or the whole frame went black. */
async function droppedTiles(pattern, count) {
  const W = 54,
    H = 96;
  const { stdout } = await ffmpeg([
    '-v',
    'error',
    '-framerate',
    String(FPS),
    '-start_number',
    '0',
    '-i',
    pattern,
    '-vf',
    `scale=${W}:${H},format=gray`,
    '-f',
    'rawvideo',
    '-',
  ]);
  const px = W * H;
  const n = Math.min(count, Math.floor(stdout.length / px));
  const frame = (i) => stdout.subarray(i * px, (i + 1) * px);
  const mean = (f) => f.reduce((a, b) => a + b, 0) / f.length;
  const bad = [];
  for (let i = 0; i < n; i++) {
    const f = frame(i),
      p = frame(Math.max(0, i - 1)),
      q = frame(Math.min(n - 1, i + 1));
    let k = 0;
    for (let j = 0; j < px; j++) if (f[j] < 3 && p[j] > 12 && q[j] > 12) k++;
    const whole = i > 0 && i < n - 1 && mean(f) < 2 && mean(p) > 10 && mean(q) > 10;
    if (k / px > 0.01 || whole) bad.push(i);
  }
  return bad;
}

/** Render the props to `dst` (H.264, picture only). Returns {file, redrawn}. */
async function renderPicture({ propsFile, publicDir, frames, dst, concurrency }) {
  // Remotion reads anything after the last dot of a sequence path as an extension, so the frames go to
  // a dot-free temporary folder whatever the caller's folder is called.
  let base = os.tmpdir();
  if (base.includes('.') && process.platform !== 'win32') base = '/tmp';
  const seq = fs.mkdtempSync(path.join(base, 'callkit-frames-'));
  const conc = concurrency || Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
  const render = (c) =>
    remotion([
      'render',
      ...common(),
      seq,
      `--props=${propsFile}`,
      `--public-dir=${publicDir}`,
      '--sequence',
      '--image-format=jpeg',
      '--jpeg-quality=96',
      `--concurrency=${c}`,
      ...browserArgs(),
      '--offthreadvideo-cache-size-in-bytes=268435456',
      '--log=error',
    ]);
  try {
    await render(conc);
  } catch (error) {
    // One retry, a frame at a time: a starved machine is the usual cause, not the props.
    fs.rmSync(seq, { recursive: true, force: true });
    fs.mkdirSync(seq);
    await render(1).catch(() => {
      throw error;
    });
  }
  const files = fs
    .readdirSync(seq)
    .filter((f) => f.endsWith('.jpeg'))
    .sort();
  if (files.length !== frames)
    throw new Error(`Rendered ${files.length} frames, expected ${frames}.`);
  const m = files[0].match(/^(.*?)(\d+)\.jpeg$/);
  const pattern = path.join(seq, `${m[1]}%0${m[2].length}d.jpeg`);
  const redrawn = [];
  for (let attempt = 0; ; attempt++) {
    const bad = await droppedTiles(pattern, frames);
    if (!bad.length) break;
    if (attempt === 3)
      throw new Error(`Frames still missing tiles after redraws: ${bad.join(', ')}`);
    for (const i of bad) {
      await remotion([
        'still',
        ...common(),
        path.join(seq, files[i]),
        `--props=${propsFile}`,
        `--public-dir=${publicDir}`,
        `--frame=${i}`,
        '--image-format=jpeg',
        '--jpeg-quality=96',
        ...browserArgs(),
        '--log=error',
      ]);
      redrawn.push(i);
    }
  }
  await ffmpeg([
    '-v',
    'error',
    '-framerate',
    String(FPS),
    '-start_number',
    '0',
    '-i',
    pattern,
    '-c:v',
    'libx264',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    dst,
  ]);
  fs.rmSync(seq, { recursive: true, force: true });
  return { file: dst, redrawn };
}

/** PNG stills of chosen seconds, for checking a layout without rendering the video. */
async function stills({ propsFile, publicDir, frames, seconds, dir }) {
  const out = [];
  for (const t of seconds) {
    const f = Math.min(frames - 1, Math.max(0, Math.round(t * FPS)));
    const file = path.join(dir, `still_${t.toFixed(2).padStart(5, '0')}.png`);
    await remotion([
      'still',
      ...common(),
      file,
      `--props=${propsFile}`,
      `--public-dir=${publicDir}`,
      `--frame=${f}`,
      ...browserArgs(),
      '--log=error',
    ]);
    out.push(file);
  }
  return out;
}

module.exports = { renderPicture, stills, droppedTiles, KIT };

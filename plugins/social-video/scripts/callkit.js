#!/usr/bin/env node
// Launcher for the Prelulu Call Kit (video-call shorts in six formats). Needs only Node.js built-ins; setup
// installs the kit's Remotion dependencies into a stable directory outside the plugin cache.
//
//   node callkit.js setup                         install (or reuse) the kit, fetch Remotion's headless Chrome
//   node callkit.js doctor                        report what is installed
//   node callkit.js guide                         the template guide (formats, config, workflow)
//   node callkit.js example <format> --dir /abs   write a ready-to-render config using the bundled demo clips
//   node callkit.js render /abs/config.json       render a finished video
//   node callkit.js stills /abs/config.json --at 0,1.5,3
//   node callkit.js analyse /abs/clip.mp4 --text "the line"
//   node callkit.js formats
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const SOURCE = path.resolve(__dirname, '..', 'callkit');
const HOME = path.resolve(
  process.env.SEEDANCE_STUDIO_HOME || path.join(os.homedir(), '.seedance-studio'),
);
const ROOT = path.join(HOME, 'callkit');
const FORMATS = ['story', 'cards-first', 'call-first', 'incoming', 'chat', 'pov', 'mockup'];

function files(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== 'node_modules' && e.name !== '.DS_Store')
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name), base)
        : [path.relative(base, path.join(dir, e.name))],
    )
    .sort();
}

/** The kit version: a digest of every shipped file, so a plugin update installs alongside, never over. */
function version() {
  const h = createHash('sha256');
  for (const f of files(SOURCE)) h.update(f).update(fs.readFileSync(path.join(SOURCE, f)));
  return h.digest('hex').slice(0, 16);
}

const installDir = () => path.join(ROOT, version());
const ready = (dir) =>
  fs.existsSync(path.join(dir, 'node_modules', '.bin', 'remotion')) &&
  fs.existsSync(path.join(dir, '.ready'));

function exec(program, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...opts,
    });
    let err = '';
    let out = '';
    child.stdout.on('data', (b) => (out = (out + b).slice(-4000)));
    child.stderr.on('data', (b) => (err = (err + b).slice(-4000)));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${path.basename(program)} exited ${code}: ${err || out}`)),
    );
  });
}

function tools() {
  const ok = (p, a) => spawnSync(p, a, { stdio: 'ignore' }).status === 0;
  return {
    node: process.versions.node,
    ffmpeg: ok(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']),
    ffprobe: ok(process.env.FFPROBE_PATH || 'ffprobe', ['-version']),
  };
}

async function setup() {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Install Node.js 22 or newer.');
  const t = tools();
  if (!t.ffmpeg || !t.ffprobe)
    throw new Error('FFmpeg and ffprobe are required on PATH (or set FFMPEG_PATH / FFPROBE_PATH).');
  const dir = installDir();
  if (!ready(dir)) {
    const tmp = `${dir}.partial-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of files(SOURCE)) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.copyFileSync(path.join(SOURCE, f), path.join(tmp, f));
    }
    const env = { ...process.env };
    for (const k of ['FAL_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'STUDIO_API_TOKEN']) delete env[k];
    await exec(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci', '--omit=dev', '--no-audit', '--no-fund'],
      { cwd: tmp, env },
    );
    // Remotion renders with its own pinned headless Chrome; fetch it now rather than mid-render.
    await exec(path.join(tmp, 'node_modules', '.bin', 'remotion'), ['browser', 'ensure'], {
      cwd: tmp,
      env,
    });
    fs.writeFileSync(path.join(tmp, '.ready'), new Date().toISOString());
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tmp, dir);
  }
  // Earlier kit versions are ~400 MB each (Remotion and its Chrome). Configs never point into them.
  for (const name of fs.readdirSync(ROOT))
    if (name !== path.basename(dir) && /^[a-f0-9]{16}$/.test(name))
      fs.rmSync(path.join(ROOT, name), { recursive: true, force: true });
  return doctor();
}

function doctor() {
  const dir = installDir();
  return {
    kitVersion: version(),
    installDir: dir,
    installed: ready(dir),
    ...tools(),
    formats: FORMATS,
    note: ready(dir)
      ? 'Ready. Rendering is local: no generation API is called and nothing is billed.'
      : 'Run setup.',
  };
}

/** A config that renders one format from the bundled Marcus demo clips; copy it and swap in your own. */
function example(format, outDir) {
  if (!FORMATS.includes(format)) throw new Error(`Format must be one of: ${FORMATS.join(', ')}.`);
  if (!outDir || !path.isAbsolute(outDir))
    throw new Error('--dir must be an absolute folder for the config and the render.');
  const dir = installDir();
  if (!ready(dir)) throw new Error('Run setup first.');
  // The demo clips are copied next to the config, so it keeps working after a kit update.
  const media = path.join(outDir, 'clips');
  fs.mkdirSync(media, { recursive: true });
  for (const f of ['marcus_A.mp4', 'marcus_B.mp4'])
    if (!fs.existsSync(path.join(media, f)))
      fs.copyFileSync(path.join(dir, 'examples', 'media', f), path.join(media, f));
  const cfg = {
    format,
    hero: { name: 'Marcus', age: 38, rosterId: 'marcus' },
    clips: [
      {
        video: 'clips/marcus_A.mp4',
        text: "You're still up? Good. I didn't want to sleep without seeing your face.",
      },
      {
        video: 'clips/marcus_B.mp4',
        text: 'Come closer to the camera. Let me look at you for a minute.',
      },
    ],
    face: { x: 554, y: 706 },
    pipSide: 'right',
    out: `marcus-${format}.mp4`,
  };
  if (format === 'story') {
    // Silent fixture excerpt: users supply measured words for actual dialogue captions.
    cfg.clips = [{ video: 'clips/marcus_A.mp4', start: 0, end: 1, words: [] }];
    cfg.povText = 'POV: your story starts here';
    cfg.povSeconds = 0.5;
    cfg.pip = false;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `marcus-${format}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return {
    config: file,
    out: path.join(outDir, cfg.out),
    note: 'Copy-specific fields fall back to the format defaults; see `guide`.',
  };
}

async function main([cmd, ...args]) {
  if (cmd === 'setup') return setup();
  if (cmd === 'doctor') return doctor();
  if (cmd === 'guide')
    return process.stdout.write(fs.readFileSync(path.join(SOURCE, 'docs', 'GUIDE.md'), 'utf8'));
  if (cmd === 'example') {
    const i = args.indexOf('--dir');
    return example(args[0], i >= 0 ? args[i + 1] : undefined);
  }
  if (!['render', 'stills', 'analyse', 'analyze', 'formats'].includes(cmd))
    throw new Error(
      'Commands: setup | doctor | guide | example <format> --dir /abs | render | stills | analyse | formats',
    );
  const dir = installDir();
  if (!ready(dir))
    throw new Error('The call kit is not installed for this plugin version. Run: callkit setup');
  // Relative paths in commands refer to the caller's folder.
  const resolved = args.map((a, i) =>
    i === 0 && cmd !== 'formats' && !a.startsWith('--') ? path.resolve(a) : a,
  );
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(dir, 'kit.js'), cmd, ...resolved], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      process.exitCode = code;
      resolve();
    });
  });
}

main(process.argv.slice(2))
  .then((r) => r && typeof r === 'object' && console.log(JSON.stringify(r, null, 2)))
  .catch((e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exitCode = 1;
  });

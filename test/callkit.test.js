const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PLUGIN_FILES } = require('../scripts/build-plugin');
const KIT = path.resolve(__dirname, '..', 'plugins', 'social-video', 'callkit');
const { alignWords } = require(path.join(KIT, 'lib', 'align'));
const { planClip, pagesFor } = require(path.join(KIT, 'lib', 'plan'));
const { curve, bedPoints, sfxTrack } = require(path.join(KIT, 'lib', 'audio'));
const exec = promisify(execFile);

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== '.DS_Store' && e.name !== 'node_modules')
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test('every call kit file ships in the plugin build, and nothing else under callkit/', () => {
  const onDisk = walk(KIT)
    .map((f) => path.relative(path.dirname(KIT), f).split(path.sep).join('/'))
    .sort();
  const listed = PLUGIN_FILES.filter((f) => f.startsWith('callkit/')).sort();
  assert.deepEqual(listed, onDisk);
  for (const f of ['scripts/callkit.js', 'skills/call-video/SKILL.md'])
    assert.ok(PLUGIN_FILES.includes(f));
});

test('the known line lands on the speech, breaking at sentence ends, ignoring sound after it', () => {
  const segments = [
    { start: 0.5, end: 1.1, voicedFraction: 0.6 },
    { start: 2.6, end: 4.0, voicedFraction: 0.6 },
    // Veo humming on well after the line ends.
    { start: 4.5, end: 7.5, voicedFraction: 0.7 },
  ];
  const { words, skipped } = alignWords(
    "You're still up? I couldn't sleep without seeing you.",
    segments,
  );
  assert.equal(words.length, 9);
  assert.equal(words[0].start, 0.5);
  assert.equal(words[2].end, 1.1); // "up?" closes the first stretch
  assert.equal(words[3].start, 2.6);
  assert.equal(words[8].end, 4.0);
  assert.deepEqual(
    skipped.map((s) => s.start),
    [4.5],
  );
  for (let i = 1; i < words.length; i++) assert.ok(words[i].start >= words[i - 1].end - 1e-9);
});

test('a long pause is trimmed to about 0.8 s, and captions follow the cut', () => {
  const info = {
    duration: 8,
    segments: [
      { start: 0.5, end: 1.0, db: -20 },
      { start: 3.5, end: 4.2, db: -20 },
    ],
    skipped: [],
    words: [
      { text: 'Hey.', start: 0.5, end: 1.0 },
      { text: 'Still', start: 3.5, end: 3.85 },
      { text: 'awake?', start: 3.85, end: 4.2 },
    ],
  };
  const plan = planClip(info, { lead: 0.35, tail: 0.95 });
  assert.equal(plan.pieces.length, 2);
  const kept = plan.pieces[0].to - 1.0 + (3.5 - plan.pieces[1].from);
  assert.ok(Math.abs(kept - 0.8) < 0.05, `kept ${kept}`);
  assert.ok(plan.seconds < 4.2 - 0.15 + 0.95 - 1.5);
  assert.ok(Math.abs(plan.words[1].start - (plan.words[0].end + kept)) < 0.04);
  const pages = pagesFor(plan.words, plan.seconds);
  assert.deepEqual(
    pages.map((p) => p.words.map((w) => w.text).join(' ')),
    ['Hey.', 'Still awake?'],
  );
  assert.equal(pages[1].end, plan.seconds);
});

test('the music bed ducks under the call and comes up for the end card', () => {
  const expr = curve(bedPoints('incoming', 12, 2.7, 12));
  const at = new Function('t', 'IF', 'lt', `return ${expr.replace(/\bif\(/g, 'IF(')};`);
  const db = (t) =>
    at(
      t,
      (c, a, b) => (c ? a : b),
      (a, b) => a < b,
    );
  assert.equal(db(0.5), -10);
  assert.equal(db(5), -14);
  assert.equal(db(11.8), 0);
  assert.ok(db(12.3) < -30);
});

test('UI sounds are synthesised to the requested length', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callkit-sfx-'));
  const file = sfxTrack(
    [
      ['ring', 0],
      ['tap', 1],
      ['pop', 1.5],
    ],
    2,
    path.join(dir, 'sfx.wav'),
  );
  const bytes = fs.statSync(file).size;
  assert.equal(bytes, 44 + 2 * 48000 * 2 * 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the launcher reports an uninstalled kit and refuses to render before setup', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'callkit-home-'));
  const launcher = path.resolve(
    __dirname,
    '..',
    'plugins',
    'social-video',
    'scripts',
    'callkit.js',
  );
  const env = { ...process.env, SEEDANCE_STUDIO_HOME: home };
  const doctor = JSON.parse((await exec(process.execPath, [launcher, 'doctor'], { env })).stdout);
  assert.equal(doctor.installed, false);
  assert.ok(doctor.installDir.startsWith(path.join(home, 'callkit')));
  await assert.rejects(
    exec(process.execPath, [launcher, 'render', 'x.json'], { env }),
    /Run: callkit setup/,
  );
  fs.rmSync(home, { recursive: true, force: true });
});

test('story edit preserves silent action, maps exact words and refuses word-clipping edits', () => {
  const { planStory } = require(path.join(KIT, 'lib', 'plan'));
  const clip = {
    video: 'scene.mp4',
    publicPath: 'scene.mp4',
    start: 1,
    end: 9,
    info: {
      duration: 10,
      words: [
        { text: 'Sir,', start: 2, end: 2.3 },
        { text: 'hello.', start: 7, end: 7.5 },
      ],
    },
  };
  const plan = planStory([clip, { ...clip, start: 8, end: 10, info: { duration: 10, words: [] } }]);
  assert.equal(plan.seconds, 10);
  assert.equal(plan.pieces.length, 2);
  assert.equal(plan.pieces[0].zoom, 1);
  assert.equal(plan.pieces[0].xf, 0);
  assert.deepEqual(
    plan.pages.flatMap((p) => p.words).map((w) => [w.text, w.start]),
    [
      ['Sir,', 1],
      ['hello.', 6],
    ],
  );
  assert.throws(() => planStory([{ ...clip, start: 2.1 }]), /spoken word/);
  assert.throws(() => planStory([{ ...clip, end: 11 }]), /source range/);
  assert.throws(
    () => planStory([{ ...clip, text: 'Missing captions', info: { duration: 10, words: [] } }]),
    /measured/,
  );
});

test('a video-only story source contributes silence instead of breaking the audio mix', async (t) => {
  const { run, FFMPEG, readPcm } = require(path.join(KIT, 'lib', 'util'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-silent-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'silent.mp4');
  await run(FFMPEG, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=black:s=32x32:r=30',
    '-t',
    '0.2',
    '-an',
    '-c:v',
    'libx264',
    file,
  ]);
  const pcm = await readPcm(file, 48000, 2);
  assert.equal(pcm.length, 19200);
  assert.ok(pcm.every((v) => v === 0));
});

test('every format preserves native audio without opting into the bundled music bed', (t) => {
  const { load, FORMATS } = require(path.join(KIT, 'lib', 'build'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-audio-default-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const config = path.join(dir, 'config.json');
  for (const format of FORMATS) {
    fs.writeFileSync(
      config,
      JSON.stringify({
        format,
        hero: { name: 'Fixture', age: 30 },
        clips: [{ video: path.join(KIT, 'examples/media/marcus_A.mp4'), text: 'Fixture.' }],
        out: path.join(dir, 'out.mp4'),
      }),
    );
    assert.equal(load(config).music, false, format);
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Engine, validateWorkflow } = require('../lib/engine');
function setup(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const providers = {
    check() {},
    async prepare(r) {
      return r;
    },
    async submit(r) {
      calls.push(r);
      return { provider: 'fal', requestId: String(calls.length) };
    },
    async poll() {
      return { status: 'completed', urls: ['https://v3.fal.media/result'] };
    },
    ...overrides,
  };
  const media = {
    localPath: (p) => p,
    async saveResult(id, urls, r) {
      return [
        {
          url: `/outputs/${id}.${r.model === 'flare' ? 'png' : 'mp4'}`,
          kind: r.model === 'flare' ? 'image' : 'video',
        },
      ];
    },
    async compose(id) {
      return { url: `/outputs/${id}.mp4`, kind: 'video' };
    },
  };
  return {
    root,
    calls,
    providers,
    media,
    engine: new Engine(root, providers, media, { ffmpeg: true }),
  };
}
test('idempotency survives restart and rejects changed payloads', async (t) => {
  const x = setup(t),
    r = { model: 'seedance', prompt: 'Cup' };
  const one = x.engine.submit(r, 'same');
  const two = x.engine.submit(r, 'same');
  assert.equal(one.id, two.id);
  assert.throws(() => x.engine.submit({ ...r, prompt: 'Different' }, 'same'), /different request/);
  await x.engine.tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.engine.jobs.get(one.id).status, 'completed');
  const next = new Engine(x.root, x.providers, x.media, { ffmpeg: true });
  assert.equal(next.submit(r, 'same').id, one.id);
  await next.tick();
  assert.equal(x.calls.length, 1);
});
test('ambiguous submission never auto retries', async (t) => {
  let attempts = 0;
  const x = setup(t, {
    async submit() {
      attempts++;
      throw new Error('Connection lost after send');
    },
  });
  const j = x.engine.submit({ model: 'seedance', prompt: 'Cup' }, 'uncertain');
  await x.engine.tick();
  await x.engine.tick();
  assert.equal(x.engine.jobs.get(j.id).status, 'unknown');
  assert.equal(attempts, 1);
});
test('restart during submit becomes unknown, while queued jobs resume polling', async (t) => {
  const x = setup(t),
    j = x.engine.submit({ model: 'seedance', prompt: 'Cup' }, 'restart');
  x.engine.jobs.get(j.id).status = 'submitting';
  x.engine.save(x.engine.jobs.get(j.id));
  const restarted = new Engine(x.root, x.providers, x.media, { ffmpeg: true });
  await restarted.tick();
  assert.equal(restarted.jobs.get(j.id).status, 'unknown');
  assert.equal(x.calls.length, 0);
});
test('temporary polling and download failures resume without another generation', async (t) => {
  let polls = 0,
    saves = 0;
  const x = setup(t, {
    async poll() {
      if (++polls === 1) throw new Error('429');
      return { status: 'completed', urls: ['https://v3.fal.media/result'] };
    },
  });
  x.media.saveResult = async () => {
    if (++saves === 1) throw new Error('download interruption');
    return [{ url: '/outputs/final.mp4' }];
  };
  const j = x.engine.submit({ model: 'seedance', prompt: 'Cup' }, 'poll');
  await x.engine.tick();
  await x.engine.tick();
  await x.engine.tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.engine.jobs.get(j.id).status, 'completed');
  assert.equal(polls, 2);
});
test('workflow passes image output into the video and composes only after completion', async (t) => {
  const x = setup(t);
  const w = x.engine.createWorkflow(
    {
      name: 'Story',
      steps: [
        { id: 'hero', request: { model: 'flare', prompt: 'Cup' } },
        { id: 'shot', request: { model: 'seedance', prompt: 'Steam', firstFrame: '@step:hero' } },
      ],
      compose: { steps: ['shot'] },
    },
    'story',
  );
  for (let i = 0; i < 4; i++) await x.engine.tick();
  assert.equal(x.calls.length, 2);
  assert.match(x.calls[1].firstFrame, /^\/outputs\/.+\.png$/);
  assert.equal(x.engine.workflows.get(w.id).status, 'completed');
  assert.match(x.engine.workflows.get(w.id).outputs[0].url, /\.mp4$/);
});
test('failed upstream step prevents later billable steps', async (t) => {
  const x = setup(t, {
    async poll() {
      return { status: 'failed', error: 'Policy rejected' };
    },
  });
  const w = x.engine.createWorkflow(
    {
      name: 'Failing',
      steps: [
        { id: 'hero', request: { model: 'flare', prompt: 'Cup' } },
        { id: 'shot', request: { model: 'seedance', prompt: 'Steam', firstFrame: '@step:hero' } },
      ],
    },
    'fail',
  );
  for (let i = 0; i < 4; i++) await x.engine.tick();
  assert.equal(x.calls.length, 1);
  assert.equal(x.engine.workflows.get(w.id).status, 'failed');
});
test('preflight reports unknown prices and blocks unavailable FFmpeg before submitting', (t) => {
  const x = setup(t);
  x.engine.ffmpeg = false;
  assert.equal(x.engine.preflight({ model: 'veo', prompt: 'Cup' }).request.resolution, '1080p');
  assert.throws(
    () => x.engine.submit({ model: 'veo', prompt: 'Cup', audio: false }, 'no-ffmpeg'),
    /FFmpeg/,
  );
  assert.equal(x.engine.preflight({ model: 'flare', prompt: 'Cup' }).estimate.usd, null);
  assert.equal(x.calls.length, 0);
});

test('existing clips can be reassembled without any provider submission', async (t) => {
  const x = setup(t);
  const composition = {
    name: 'Revised cut',
    clips: ['/outputs/shot-a.mp4', '/outputs/shot-b.mp4'],
  };
  const w = x.engine.composeExisting(composition, 'edit-v2');
  assert.equal(x.engine.composeExisting(composition, 'edit-v2').id, w.id);
  await x.engine.tick();
  assert.equal(x.calls.length, 0);
  assert.equal(x.engine.workflows.get(w.id).status, 'completed');
  assert.throws(
    () => x.engine.composeExisting({ ...composition, clips: ['/outputs/hero.png'] }, 'bad'),
    /MP4/,
  );
});

test('workflow resolves trimmed and repeated shots and independent audio to actual assets', async (t) => {
  const x = setup(t);
  let composition;
  x.media.compose = async (...args) => {
    composition = args;
    return { url: '/outputs/cut.mp4' };
  };
  const w = x.engine.createWorkflow(
    {
      name: 'Coverage',
      steps: [
        { id: 'shot', request: { model: 'seedance', prompt: 'A visible action', duration: 5 } },
      ],
      compose: {
        steps: [
          { step: 'shot', start: 1, end: 2, volume: 0 },
          { step: 'shot', start: 3, end: 4, volume: 0 },
        ],
        audioTracks: [{ url: '@step:shot', start: 0, end: 1.5, at: 0.25 }],
      },
    },
    'coverage',
  );
  for (let i = 0; i < 3; i++) await x.engine.tick();
  assert.equal(x.engine.workflows.get(w.id).status, 'completed');
  assert.equal(x.calls.length, 1);
  assert.equal(composition[1][0].url, composition[1][1].url);
  assert.equal(composition[1][0].start, 1);
  assert.equal(composition[1][1].end, 4);
  assert.equal(composition[4][0].url, composition[1][0].url);
  assert.equal(composition[4][0].at, 0.25);
});

test('bad edit fields and impossible workflow ranges fail before any generation', (t) => {
  const x = setup(t);
  const base = {
    name: 'Range',
    steps: [{ id: 'shot', request: { model: 'veo', prompt: 'A cup' } }],
  };
  for (const clip of [
    { step: 'shot', start: -1 },
    { step: 'shot', start: 2, end: 1 },
    { step: 'shot', end: 9 },
    { step: 'shot', start: 8 },
    { step: 'shot', end: 2, volume: 5 },
    { step: 'shot', end: 2, speed: 2 },
  ])
    assert.throws(() => x.engine.createWorkflow({ ...base, compose: { steps: [clip] } }, 'bad'));
  assert.throws(
    () =>
      validateWorkflow({
        ...base,
        compose: { steps: ['shot'], audioTracks: [{ url: '@step:missing' }] },
      }),
    /video step/,
  );
  assert.throws(
    () =>
      validateWorkflow({
        ...base,
        steps: [{ id: 'shot', request: { model: 'veo', prompt: 'A cup', audio: false } }],
        compose: { steps: ['shot'], audioTracks: [{ url: '@step:shot' }] },
      }),
    /audio enabled/,
  );
  assert.equal(x.engine.jobs.size, 0);
  assert.equal(x.calls.length, 0);
});

test('edit idempotency preserves cut timing and audio settings across restart', async (t) => {
  const x = setup(t);
  const cut = {
    name: 'Edit',
    clips: [{ url: '/outputs/shot.mp4', start: 1, end: 2, volume: 0 }],
    audioTracks: [{ url: '/assets/sound.wav', start: 0, end: 0.5, at: 0.2 }],
  };
  const w = x.engine.composeExisting(cut, 'cut');
  const restarted = new Engine(x.root, x.providers, x.media, { ffmpeg: true });
  assert.equal(restarted.composeExisting(cut, 'cut').id, w.id);
  assert.throws(
    () => restarted.composeExisting({ ...cut, clips: [{ ...cut.clips[0], end: 3 }] }, 'cut'),
    /already used/,
  );
  assert.throws(
    () =>
      restarted.composeExisting(
        { ...cut, audioTracks: [{ ...cut.audioTracks[0], at: 0.3 }] },
        'cut',
      ),
    /already used/,
  );
  await restarted.tick();
  assert.equal(restarted.workflows.get(w.id).status, 'completed');
  assert.equal(x.calls.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createStudio } = require('../server');
const { runFFmpeg, ffmpegAvailable } = require('../lib/media');
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-http-'));
  const studio = createStudio({
    dataDir: root,
    ffmpeg: true,
    providers: {
      check() {},
      async prepare(r) {
        return r;
      },
      async submit() {
        return { provider: 'fal', requestId: 'test' };
      },
      async poll() {
        return { status: 'running' };
      },
    },
  });
  studio.server.listen(0, '127.0.0.1');
  await once(studio.server, 'listening');
  t.after(async () => {
    studio.engine.stop();
    await new Promise((r) => studio.server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${studio.server.address().port}`;
  return { ...studio, base, root, fetch: (url, opt) => fetch(base + url, opt) };
}
test('HTTP serves the app but never exposes secrets or server source', async (t) => {
  const s = await setup(t);
  for (const route of [
    '/.env',
    '/config.local.js',
    '/server.js',
    '/.git/config',
    '/.studio/records/test.json',
    '/lib/config.js',
  ])
    assert.equal((await s.fetch(route)).status, 404, route);
  assert.equal((await s.fetch('/')).status, 200);
  assert.equal((await s.fetch('/api/models')).status, 200);
  assert.equal((await s.fetch('/api/guides/veo')).status, 200);
  assert.equal(
    (await s.fetch('/api/health', { headers: { Origin: 'https://evil.test' } })).status,
    403,
  );
});
test('validates before paid calls, requires idempotency and reuses the same job', async (t) => {
  const s = await setup(t),
    body = JSON.stringify({
      model: 'minimax',
      images: ['https://v3.fal.media/hero.png'],
      prompt: 'A cup',
    });
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  assert.equal((await s.fetch('/api/jobs', options)).status, 400);
  options.headers['Idempotency-Key'] = 'job-1';
  const a = await (await s.fetch('/api/jobs', options)).json();
  const b = await (await s.fetch('/api/jobs', options)).json();
  assert.equal(a.id, b.id);
  assert.equal(
    (
      await s.fetch('/api/preview', {
        ...options,
        body: JSON.stringify({ model: 'veo', prompt: 'x', duration: 5 }),
      })
    ).status,
    400,
  );
  const list = await (await s.fetch('/api/jobs')).json();
  assert.equal(list.jobs[0].model, 'minimax');
  assert.equal(list.jobs[0].request, undefined);
});
test('asset upload is local and supports byte-range playback', async (t) => {
  const s = await setup(t);
  const r = await s.fetch('/api/assets?filename=clip.mp4', {
    method: 'POST',
    body: Buffer.from('0123456789'),
  });
  assert.equal(r.status, 201);
  const asset = await r.json();
  assert.match(asset.url, /^\/assets\//);
  const part = await s.fetch(asset.url, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), '2345');
  const tail = await s.fetch(asset.url, { headers: { Range: 'bytes=-3' } });
  assert.equal(await tail.text(), '789');
  assert.equal((await s.fetch(asset.url, { headers: { Range: 'bytes=999-' } })).status, 416);
  assert.equal(
    (await s.fetch('/api/assets?filename=evil.js', { method: 'POST', body: 'x' })).status,
    400,
  );
});
test('shared token protects API/media and can create an HttpOnly browser session', async (t) => {
  const previous = process.env.STUDIO_API_TOKEN;
  process.env.STUDIO_API_TOKEN = 'test-token';
  t.after(() => {
    if (previous === undefined) delete process.env.STUDIO_API_TOKEN;
    else process.env.STUDIO_API_TOKEN = previous;
  });
  const s = await setup(t);
  assert.equal((await s.fetch('/api/models')).status, 401);
  const session = await s.fetch('/api/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(session.status, 200);
  assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal((await s.fetch('/api/models', { headers: { Cookie: cookie } })).status, 200);
});

test(
  'HTTP exposes directing, local inspection and timeline preview without creating generation jobs',
  { skip: !ffmpegAvailable(), timeout: 15000 },
  async (t) => {
    const s = await setup(t);
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=160x90:r=24',
      '-t',
      '1',
      '-c:v',
      'libx264',
      path.join(s.root, 'outputs', 'clip.mp4'),
    ]);
    const post = (route, value) =>
      s.fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
    assert.equal((await s.fetch('/api/guides/directing')).status, 200);
    const composition = {
      name: 'Cut',
      clips: [{ url: '/outputs/clip.mp4', start: 0.25, end: 0.75 }],
    };
    const preview = await post('/api/compose/preview', composition);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).timeline.duration, 0.5);
    assert.equal(
      (
        await post('/api/compose/preview', {
          ...composition,
          clips: [{ url: '/outputs/clip.mp4', end: 2 }],
        })
      ).status,
      400,
    );
    const inspection = await post('/api/inspect', { url: '/outputs/clip.mp4', times: [0.25] });
    assert.equal(inspection.status, 200);
    const frame = (await inspection.json()).frames[0];
    const image = await s.fetch(frame.url);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(
      (await post('/api/inspect', { url: '/outputs/clip.mp4', times: null })).status,
      400,
    );
    assert.equal(
      (await post('/api/inspect', { url: '/outputs/clip.mp4', times: [2] })).status,
      400,
    );
    assert.equal((await post('/api/inspect', { url: '/etc/passwd' })).status, 400);
    assert.equal(s.engine.jobs.size, 0);
    assert.equal(s.engine.workflows.size, 0);
  },
);

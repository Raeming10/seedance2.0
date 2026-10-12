const test = require('node:test');
const assert = require('node:assert/strict');
const { Providers } = require('../lib/providers');
const { normalize } = require('../lib/catalog');
const { allowedDownload } = require('../lib/media');
const http = require('node:http');
const { once } = require('node:events');
const { GoogleGenAI } = require('@google/genai');

test('persisted Google receipt polls through the real SDK response converter without resubmitting', async (t) => {
  const name = 'models/veo-3.1-generate-preview/operations/persisted';
  const calls = [];
  const responses = [
    { name, done: false },
    {
      name,
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [
            { video: { uri: 'https://generativelanguage.googleapis.com/video.mp4' } },
          ],
        },
      },
    },
    { name, done: true, error: { code: 400, message: 'Fixture rejected' } },
  ];
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, url: req.url });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(responses.shift()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const sdk = new GoogleGenAI({
    apiKey: 'local-fixture',
    httpOptions: {
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      retryOptions: { attempts: 1 },
    },
  });
  const provider = new Providers({});
  provider.google = () => sdk;
  const receipt = JSON.parse(JSON.stringify({ provider: 'google', name }));
  assert.equal((await provider.poll(receipt)).status, 'running');
  assert.deepEqual(await provider.poll(receipt), {
    status: 'completed',
    urls: ['https://generativelanguage.googleapis.com/video.mp4'],
  });
  assert.match((await provider.poll(receipt)).error, /Fixture rejected/);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.method === 'GET' && c.url.endsWith('/' + name)));
});
test('official Google adapter sends references, duration and native 1080p through SDK', async () => {
  const p = new Providers({ image: async (v) => ({ imageBytes: v, mimeType: 'image/png' }) });
  const prepared = await p.prepare(normalize({ model: 'veo', prompt: 'Cup', images: ['image-a'] }));
  assert.equal(prepared.model, 'veo-3.1-generate-preview');
  assert.equal(prepared.config.resolution, '1080p');
  assert.equal(prepared.config.durationSeconds, 8);
  assert.deepEqual(prepared.config.referenceImages, [
    { image: { imageBytes: 'image-a', mimeType: 'image/png' }, referenceType: 'asset' },
  ]);
  assert.equal(prepared.image, undefined);
  const frames = await p.prepare(
    normalize({ model: 'veo', prompt: 'Cup', firstFrame: 'first', lastFrame: 'last' }),
  );
  assert.equal(frames.image.imageBytes, 'first');
  assert.equal(frames.config.lastFrame.imageBytes, 'last');
  assert.equal(frames.config.referenceImages, undefined);
});
test('Google polling retains operation name and handles safety-filtered outputs', async () => {
  const p = new Providers({});
  let name;
  p.google = () => ({
    operations: {
      async getVideosOperation({ operation }) {
        assert.equal(typeof operation._fromAPIResponse, 'function');
        name = operation.name;
        return { done: true, response: { raiMediaFilteredReasons: ['No eligible output'] } };
      },
    },
  });
  const r = await p.poll({
    provider: 'google',
    name: 'models/veo-3.1-generate-preview/operations/id',
  });
  assert.match(name, /operations\/id$/);
  assert.equal(r.status, 'failed');
  assert.match(r.error, /No eligible output/);
});
test('fal polls provider receipt URLs, not guessed queue paths', async () => {
  const p = new Providers({});
  const calls = [];
  p.falJson = async (url) => {
    calls.push(url);
    return url.endsWith('/status')
      ? { status: 'COMPLETED' }
      : { video: { url: 'https://v3.fal.media/out.mp4' } };
  };
  const receipt = {
    provider: 'fal',
    statusUrl: 'https://queue.fal.run/minimax/h3/requests/test/status',
    resultUrl: 'https://queue.fal.run/minimax/h3/requests/test',
  };
  assert.equal((await p.poll(receipt)).status, 'completed');
  assert.deepEqual(calls, [receipt.statusUrl, receipt.resultUrl]);
});
test('media downloads reject arbitrary/internal hosts and credential exfiltration', () => {
  for (const u of [
    'http://127.0.0.1/a',
    'https://evil.test/a',
    'https://fal.media.evil.test/a',
    'https://key@fal.media/a',
    'https://fal.media:8443/a',
  ])
    assert.throws(() => allowedDownload(u, true));
  assert.equal(allowedDownload('https://v3.fal.media/a').hostname, 'v3.fal.media');
  assert.throws(() => allowedDownload('https://generativelanguage.googleapis.com/file'));
  assert.ok(allowedDownload('https://generativelanguage.googleapis.com/file', true));
});

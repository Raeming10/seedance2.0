const test = require('node:test');
const assert = require('node:assert/strict');
const { Providers } = require('../lib/providers');
const { normalize } = require('../lib/catalog');
const { allowedDownload } = require('../lib/media');
test('official Google adapter sends references, duration and native 4K through SDK', async () => {
  const p = new Providers({ image: async (v) => ({ imageBytes: v, mimeType: 'image/png' }) });
  const prepared = await p.prepare(normalize({ model: 'veo', prompt: 'Cup', images: ['image-a'] }));
  assert.equal(prepared.model, 'veo-3.1-generate-preview');
  assert.equal(prepared.config.resolution, '4k');
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

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, imageSize, falRequest, MODELS, estimate } = require('../lib/catalog');
const { validateWorkflow } = require('../lib/engine');
const image = 'https://v3.fal.media/hero.png';
test('only requested active models are discoverable', () => {
  assert.deepEqual(
    MODELS.map((m) => m.id),
    ['flare', 'seedance', 'minimax', 'veo'],
  );
  assert.ok(
    MODELS.filter((m) => m.provider === 'fal' && m.kind === 'video').every((m) =>
      m.resolutions.every((r) => ['720p', '768p', '1080p'].includes(r)),
    ),
  );
});
test('Flare uses medium and valid 2K dimensions for preset and custom ratios', () => {
  for (const ratio of [...MODELS[0].ratios, '2.5:1']) {
    const size = imageSize(ratio);
    assert.equal(Math.max(size.width, size.height), 2048);
    assert.equal(size.width % 16, 0);
    assert.equal(size.height % 16, 0);
    assert.ok(size.width * size.height >= 655360);
  }
  assert.throws(() => imageSize('4:1'), /1:3/);
  assert.throws(() => imageSize('0:0'), /1:3/);
  const p = falRequest(normalize({ model: 'flare', prompt: 'A cup', images: [image] }));
  assert.equal(p.endpoint, 'openai/gpt-image-2.5/flare/edit');
  assert.equal(p.input.quality, 'medium');
  assert.deepEqual(p.input.image_size, { width: 1152, height: 2048 });
  assert.deepEqual(p.input.image_urls, [image]);
});
test('Seedance maps all modes and never silently drops references', () => {
  let p = falRequest(normalize({ model: 'seedance', prompt: 'Pan', duration: 6 }));
  assert.equal(p.endpoint, 'bytedance/seedance-2.0/text-to-video');
  assert.equal(p.input.duration, '6');
  p = falRequest(
    normalize({
      model: 'seedance',
      prompt: 'Pan',
      firstFrame: image,
      lastFrame: image,
      resolution: '1080p',
      audio: false,
    }),
  );
  assert.equal(p.input.end_image_url, image);
  assert.equal(p.input.generate_audio, false);
  p = falRequest(
    normalize({
      model: 'seedance',
      prompt: '@Image1',
      images: [image],
      audios: ['https://v3.fal.media/a.wav'],
    }),
  );
  assert.deepEqual(p.input.image_urls, [image]);
  assert.equal(p.endpoint, 'bytedance/seedance-2.0/reference-to-video');
  assert.throws(
    () => normalize({ model: 'seedance', prompt: 'x', mode: 'text', images: [image] }),
    /combined/,
  );
  assert.throws(
    () => normalize({ model: 'seedance', prompt: 'x', audios: [image] }),
    /require an image/,
  );
  assert.throws(
    () => normalize({ model: 'seedance', prompt: 'x', resolution: '4k' }),
    /resolution/,
  );
});
test('MiniMax references use its actual schema and native resolution', () => {
  const p = falRequest(
    normalize({
      model: 'minimax',
      prompt: 'Image 1 walks',
      images: [image],
      videos: [image],
      audios: [image],
    }),
  );
  assert.equal(p.endpoint, 'minimax/h3/reference-to-video');
  assert.equal(p.input.resolution, '768P');
  assert.equal(p.input.duration, 5);
  assert.deepEqual(p.input.reference_image_urls, [image]);
  assert.deepEqual(p.input.reference_video_urls, [image]);
  assert.deepEqual(p.input.reference_audio_urls, [image]);
  assert.equal(p.input.prompt_expansion_mode, 'disabled');
  assert.equal(p.input.image_urls, undefined);
  assert.throws(
    () => normalize({ model: 'minimax', prompt: 'x', images: [image], duration: 4 }),
    /duration/,
  );
  assert.throws(
    () => normalize({ model: 'minimax', prompt: 'x', images: [image], resolution: '1080p' }),
    /resolution/,
  );
});
test('Veo validates reference/frames exclusivity, ratios and high-resolution durations', () => {
  const r = normalize({ model: 'veo', prompt: 'A cup', images: [image] });
  assert.equal(r.duration, 8);
  assert.equal(r.resolution, '1080p');
  assert.equal(estimate(r).usd, 3.2);
  assert.equal(
    normalize({ model: 'veo', prompt: 'Pan', resolution: '720p', duration: 4 }).duration,
    4,
  );
  for (const bad of [
    { resolution: '2k' },
    { resolution: '4k' },
    { resolution: '1080p', duration: 6 },
    { resolution: '720p', duration: 4, images: [image] },
    { images: [image], firstFrame: image },
    { aspectRatio: '1:1' },
    { images: [image, image, image, image] },
    { lastFrame: image },
  ])
    assert.throws(() => normalize({ model: 'veo', prompt: 'x', ...bad }));
});
test('workflow validates all steps before charging and rejects cycles, wrong types and duplicate IDs', () => {
  const base = {
    name: 'Story',
    steps: [
      { id: 'hero', request: { model: 'flare', prompt: 'Cup' } },
      { id: 'shot', request: { model: 'seedance', prompt: 'Steam', firstFrame: '@step:hero' } },
    ],
    compose: { steps: ['shot'] },
  };
  assert.equal(validateWorkflow(base).steps[1].request.mode, 'image');
  const bad = structuredClone(base);
  bad.steps[0].request.images = ['@step:shot'];
  assert.throws(() => validateWorkflow(bad), /earlier/);
  const badType = structuredClone(base);
  badType.steps[1].request = { model: 'seedance', prompt: 'x', videos: ['@step:hero'] };
  assert.throws(() => validateWorkflow(badType), /wrong media type/);
  const duplicate = structuredClone(base);
  duplicate.steps[1].id = 'hero';
  assert.throws(() => validateWorkflow(duplicate), /Duplicate/);
  const badCompose = structuredClone(base);
  badCompose.compose.steps = ['hero'];
  assert.throws(() => validateWorkflow(badCompose), /video step/);
  assert.throws(() => normalize({ model: 'flare', prompt: 'x', madeUpField: 1 }), /Unrecognized/);
});

test('MiniMax estimate uses 768P pricing and extra reference-image charges', () => {
  const r = normalize({
    model: 'minimax',
    prompt: 'Reference cast',
    images: Array(7).fill(image),
    duration: 5,
  });
  assert.equal(estimate(r).usd, 0.46);
});

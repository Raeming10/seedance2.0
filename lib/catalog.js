const { z } = require('zod');

const RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];
const IMAGE_RATIOS = [...RATIOS, '4:5', '5:4', '3:2', '2:3', '9:21'];
const MODELS = [
  {
    id: 'flare',
    name: 'GPT Image 2.5 Flare · Medium',
    provider: 'fal',
    kind: 'image',
    modes: ['text', 'edit'],
    ratios: IMAGE_RATIOS,
    resolutions: ['2k'],
    guide: 'flare',
    maxImages: 16,
    note: 'Medium quality；长边约 2048px，尺寸按 16 像素对齐。支持自定义比例 1:3–3:1。',
  },
  {
    id: 'seedance',
    name: 'Seedance 2.0',
    provider: 'fal',
    kind: 'video',
    modes: ['text', 'image', 'frames', 'reference'],
    ratios: RATIOS,
    resolutions: ['720p', '1080p'],
    durations: Array.from({ length: 12 }, (_, i) => i + 4),
    guide: 'seedance',
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    note: '性价比默认选项；支持原生音频、多模态参考和首尾帧。',
  },
  {
    id: 'minimax',
    name: 'MiniMax H3',
    provider: 'fal',
    kind: 'video',
    modes: ['image', 'frames', 'reference'],
    ratios: RATIOS,
    resolutions: ['768p'],
    durations: Array.from({ length: 11 }, (_, i) => i + 5),
    guide: 'minimax',
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    note: '原生 768P；首帧模式沿用图片比例，参考模式可指定比例。音频原生生成，可在本地静音。',
  },
  {
    id: 'veo',
    name: 'Google Veo 3.1 · 官方 API',
    provider: 'google',
    kind: 'video',
    modes: ['text', 'image', 'frames', 'reference'],
    ratios: ['9:16', '16:9'],
    resolutions: ['2k', '1080p', '720p', '4k'],
    durations: [4, 6, 8],
    guide: 'veo',
    maxImages: 3,
    note: '2K 交付 = 原生 4K 缩至 1440p（需 FFmpeg，按 4K 计费）。参考图及高清档固定 8 秒；原生带音频。',
  },
];
const media = z
  .string()
  .min(1)
  .max(32 * 1024 * 1024);
const requestSchema = z
  .object({
    model: z.enum(['flare', 'seedance', 'minimax', 'veo']),
    mode: z.enum(['text', 'edit', 'image', 'frames', 'reference']).optional(),
    prompt: z.string().trim().min(1).max(32000),
    aspectRatio: z.string().default('9:16'),
    resolution: z.string().optional(),
    duration: z.number().int().optional(),
    images: z.array(media).max(16).default([]),
    videos: z.array(media).max(3).default([]),
    audios: z.array(media).max(3).default([]),
    firstFrame: media.optional(),
    lastFrame: media.optional(),
    audio: z.boolean().default(true),
  })
  .strict();

function fail(message) {
  const e = new Error(message);
  e.status = 400;
  throw e;
}
function modelById(id) {
  const m = MODELS.find((m) => m.id === id);
  if (!m) fail('Unknown model. Read /api/models.');
  return m;
}
function imageSize(ratio) {
  if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) fail('Use an aspect ratio such as 9:16.');
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h || w / h > 3 || h / w > 3) fail('Image aspect ratio must be between 1:3 and 3:1.');
  return {
    width: Math.round((2048 * w) / Math.max(w, h) / 16) * 16,
    height: Math.round((2048 * h) / Math.max(w, h) / 16) * 16,
  };
}
function normalize(input) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const r = parsed.data,
    m = modelById(r.model);
  r.mode ||=
    m.kind === 'image'
      ? r.images.length
        ? 'edit'
        : 'text'
      : r.lastFrame
        ? 'frames'
        : r.firstFrame
          ? 'image'
          : r.images.length + r.videos.length + r.audios.length
            ? 'reference'
            : 'text';
  r.resolution ||= m.resolutions[0];
  if (!m.modes.includes(r.mode)) fail(`${m.name} does not support mode ${r.mode}.`);
  if (!m.resolutions.includes(r.resolution))
    fail(`${m.name} resolution must be ${m.resolutions.join(', ')}.`);
  if (m.kind === 'image') imageSize(r.aspectRatio);
  else {
    if (!m.ratios.includes(r.aspectRatio))
      fail(`${m.name} aspect ratio must be ${m.ratios.join(', ')}.`);
    r.duration ??= r.model === 'veo' ? 8 : 5;
    if (!m.durations.includes(r.duration))
      fail(`${m.name} duration must be ${m.durations.join(', ')} seconds.`);
  }
  if (
    r.images.length > m.maxImages ||
    r.videos.length > (m.maxVideos || 0) ||
    r.audios.length > (m.maxAudios || 0)
  )
    fail('Too many references for this model. Read /api/models.');
  if (m.kind === 'video' && r.images.length + r.videos.length + r.audios.length > 12)
    fail('At most 12 reference files are supported.');
  if (['image', 'frames'].includes(r.mode) && !r.firstFrame) fail('firstFrame is required.');
  if (r.mode === 'frames' && !r.lastFrame) fail('lastFrame is required for frames mode.');
  if (!['image', 'frames'].includes(r.mode) && (r.firstFrame || r.lastFrame))
    fail('Frame inputs cannot be combined with this mode.');
  if (r.mode === 'image' && r.lastFrame) fail('Use frames mode when supplying lastFrame.');
  const referenceCount = r.images.length + r.videos.length + r.audios.length;
  if (!['reference', 'edit'].includes(r.mode) && referenceCount)
    fail('Reference inputs cannot be combined with this mode.');
  if (['reference', 'edit'].includes(r.mode) && !referenceCount)
    fail('At least one reference is required.');
  if (r.model === 'seedance' && r.mode === 'reference' && !r.images.length && !r.videos.length)
    fail('Seedance audio references require an image or video reference.');
  if (r.model === 'veo' && (r.resolution !== '720p' || r.mode === 'reference') && r.duration !== 8)
    fail('Veo reference images and 1080p/2K/4K require duration: 8.');
  if (r.model === 'flare' && input.duration !== undefined)
    fail('Image generation does not accept duration.');
  return r;
}
function estimate(r) {
  let usd = null;
  if (r.model === 'seedance' && !r.videos.length)
    usd = r.duration * (r.resolution === '1080p' ? 0.682 : 0.3034);
  if (r.model === 'minimax')
    usd =
      r.duration * 0.06 + (r.mode === 'reference' ? Math.max(0, r.images.length - 5) * 0.08 : 0);
  if (r.model === 'veo') usd = r.duration * (['2k', '4k'].includes(r.resolution) ? 0.6 : 0.4);
  return {
    usd: usd === null ? null : Number(usd.toFixed(4)),
    approximate: true,
    checked: '2026-10-11',
    note:
      usd === null
        ? 'Variable pricing; check provider billing. No numeric quote is assumed.'
        : 'Planning estimate only; actual provider billing may differ.',
  };
}
function falRequest(r) {
  if (r.model === 'flare')
    return {
      endpoint: `openai/gpt-image-2.5/flare/${r.mode === 'edit' ? 'edit' : 'text-to-image'}`,
      input: {
        prompt: r.prompt,
        quality: 'medium',
        image_size: imageSize(r.aspectRatio),
        num_images: 1,
        output_format: 'png',
        ...(r.mode === 'edit' ? { image_urls: r.images } : {}),
      },
    };
  const reference = r.mode === 'reference';
  const endpoint =
    r.model === 'seedance'
      ? `bytedance/seedance-2.0/${reference ? 'reference-to-video' : r.mode === 'text' ? 'text-to-video' : 'image-to-video'}`
      : `minimax/h3/${reference ? 'reference-to-video' : 'image-to-video'}`;
  const input = {
    prompt: r.prompt,
    duration: r.model === 'seedance' ? String(r.duration) : r.duration,
    resolution: r.model === 'minimax' ? '768P' : r.resolution,
  };
  if (r.model === 'seedance')
    Object.assign(input, { aspect_ratio: r.aspectRatio, generate_audio: r.audio, codec: 'H264' });
  else input.prompt_expansion_mode = 'disabled';
  if (reference) {
    input.aspect_ratio = r.aspectRatio;
    const prefix = r.model === 'minimax' ? 'reference_' : '';
    for (const [key, val] of [
      ['image_urls', r.images],
      ['video_urls', r.videos],
      ['audio_urls', r.audios],
    ])
      if (val.length) input[prefix + key] = val;
  }
  if (r.firstFrame) input.image_url = r.firstFrame;
  if (r.lastFrame) input.end_image_url = r.lastFrame;
  return { endpoint, input };
}
module.exports = {
  MODELS,
  requestSchema,
  normalize,
  modelById,
  imageSize,
  estimate,
  falRequest,
  fail,
};

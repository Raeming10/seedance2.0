const { z } = require('zod');
const { fail } = require('./catalog');

const range = {
  start: z.number().finite().min(0).max(600).default(0),
  end: z.number().finite().positive().max(600).optional(),
  volume: z.number().finite().min(0).max(4).default(1),
};
const ordered = (s) =>
  s.refine((v) => v.end === undefined || v.end > v.start, {
    message: 'end must be greater than start.',
    path: ['end'],
  });
const clipSchema = z.union([
  z.string().min(1),
  ordered(z.object({ url: z.string().min(1), ...range }).strict()),
]);
const stepClipSchema = z.union([
  z.string().min(1),
  ordered(z.object({ step: z.string().min(1), ...range }).strict()),
]);
const audioSchema = ordered(
  z
    .object({
      url: z.string().min(1),
      ...range,
      at: z.number().finite().min(0).max(18000).default(0),
      fadeIn: z.number().finite().min(0).max(600).default(0),
      fadeOut: z.number().finite().min(0).max(600).default(0),
    })
    .strict(),
);
const compositionFields = {
  aspectRatio: z.enum(['9:16', '16:9', '1:1', '4:3', '3:4', '21:9']).default('9:16'),
  resolution: z.enum(['720p', '1080p', '2k']).default('1080p'),
  // Optional rather than default [] preserves fingerprints of existing saved workflows.
  audioTracks: z.array(audioSchema).max(16).optional(),
};
const compositionSchema = z
  .object({
    name: z.string().min(1).max(120),
    clips: z.array(clipSchema).min(1).max(30),
    ...compositionFields,
  })
  .strict();
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    fail(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
function clipObject(clip) {
  return typeof clip === 'string' ? { url: clip, start: 0, volume: 1 } : clip;
}
function stepId(clip) {
  return typeof clip === 'string' ? clip : clip.step;
}
function resolveStepClip(clip, completed) {
  if (typeof clip === 'string') return completed[clip].url;
  const { step, ...edit } = clip;
  return { url: completed[step].url, ...edit };
}
module.exports = {
  clipSchema,
  stepClipSchema,
  compositionFields,
  compositionSchema,
  parse,
  clipObject,
  stepId,
  resolveStepClip,
};

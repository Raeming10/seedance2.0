import { z } from 'zod';

const wordSchema = z.object({ text: z.string(), start: z.number(), end: z.number() });

/** One caption page: a phrase shown whole, its words lit as they are spoken. Seconds are local to the segment. */
const pageSchema = z.object({ start: z.number(), end: z.number(), words: z.array(wordSchema) });

/** A kept span of the source clip, in source seconds. `dissolve`: blend into this piece from the previous one (a close pose match) rather than cut hard. */
const pieceSchema = z.object({
  from: z.number(),
  to: z.number(),
  zoom: z.number(),
  dissolve: z.boolean(),
  /** The clip this piece comes from, when a call is stitched from several clips; else the segment's. */
  video: z.string().optional(),
  origin: z.object({ x: z.number(), y: z.number() }).optional(),
});

/** One call segment: pieces of one generated clip played back to back. Page times are on the cut timeline. */
const segmentSchema = z.object({
  video: z.string(),
  pieces: z.array(pieceSchema).min(1),
  origin: z.object({ x: z.number(), y: z.number() }),
  pages: z.array(pageSchema),
});

const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
  portrait: z.string(),
});

export type Segment = z.infer<typeof segmentSchema>;
export type Piece = z.infer<typeof pieceSchema>;
export type Card = z.infer<typeof cardSchema>;

export const FPS = 30;
export const DIP_FRAMES = 7;

export const pieceFrames = (pc: Piece) => Math.round((pc.to - pc.from) * FPS);
export const segmentFrames = (s: Segment) => s.pieces.reduce((n, pc) => n + pieceFrames(pc), 0);

export const cardSlotSchema = z.enum(['video', 'green']);

/**
 * The two template orders. The card ring never sits inside the call: either it opens the video and lands
 * on his card, which becomes the call, or the call ends by shrinking into his card and the ring plays out.
 */
export const templateAdSchema = z.object({
  order: z.enum(['cards-first', 'call-first']),
  hero: cardSchema,
  call: segmentSchema,
  roster: z.array(cardSchema),
  headline: z.string(),
  subline: z.string(),
  cardsSeconds: z.number(),
  pipOffset: z.number(),
  timerStart: z.number(),
  pipSide: z.enum(['right', 'left']),
});

export type TemplateAdProps = z.infer<typeof templateAdSchema>;

export const templateTimeline = (p: Pick<TemplateAdProps, 'call' | 'cardsSeconds'>) => {
  const fcall = segmentFrames(p.call);
  const fc = Math.round(p.cardsSeconds * FPS);
  return { fcall, fc, total: fcall + fc };
};

/**
 * Four more formats around the same call, none of them the card ring. The intro (if any) is on the
 * video's own timeline before the call; every time below is in seconds from the start of the video.
 *   incoming: his call rings on her phone and she answers.   chat: a late-night chat turns into his call.
 *   pov: native POV text over his face, the call interface arrives after.   mockup: the call in a phone.
 */
export const formatAdSchema = z.object({
  format: z.enum(['incoming', 'chat', 'pov', 'mockup']),
  hero: cardSchema,
  call: segmentSchema,
  introSeconds: z.number(),
  /** When her finger lands on "accept" (incoming, chat). */
  tapAt: z.number(),
  pip: z.boolean(),
  pipOffset: z.number(),
  timerStart: z.number(),
  pipSide: z.enum(['right', 'left']),
  headline: z.string(),
  subline: z.string(),
  pov: z.string(),
  povSeconds: z.number(),
  chips: z.array(z.object({ text: z.string(), at: z.number() })),
  messages: z.array(z.object({ from: z.enum(['her', 'him']), text: z.string(), at: z.number() })),
  /** chat: when his incoming-call banner drops in. */
  ringAt: z.number(),
});

export type FormatAdProps = z.infer<typeof formatAdSchema>;

export const formatTimeline = (p: Pick<FormatAdProps, 'call' | 'introSeconds'>) => {
  const fi = Math.round(p.introSeconds * FPS);
  const fcall = segmentFrames(p.call);
  return { fi, fcall, total: fi + fcall };
};

/** Every format in one composition: the two card-ring orders (A/B) and the four intros (C-F). */
export const FORMATS = [
  'story',
  'cards-first',
  'call-first',
  'incoming',
  'chat',
  'pov',
  'mockup',
] as const;
export const adSchema = formatAdSchema.extend({
  format: z.enum(FORMATS),
  roster: z.array(cardSchema),
  cardsSeconds: z.number(),
  subline: z.string(),
});
export type AdProps = z.infer<typeof adSchema>;
export const isRing = (f: AdProps['format']): f is 'cards-first' | 'call-first' =>
  f === 'cards-first' || f === 'call-first';
export const adTimeline = (p: AdProps) =>
  isRing(p.format) ? templateTimeline(p) : formatTimeline(p);

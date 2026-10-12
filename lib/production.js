const { z } = require('zod');
const { fail } = require('./catalog');

const text = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);
// Creative intent travels with the workflow, never inside a provider request.
const productionSchema = z
  .object({
    brand: text,
    targetDuration: z.number().positive().max(600),
    story: z.object({ setup: text, conflict: text, turn: text, payoff: text }).strict(),
    beats: z
      .array(
        z
          .object({
            id,
            start: z.number().min(0),
            end: z.number().positive(),
            action: text,
            change: text,
            dialogue: z.array(z.object({ speaker: text, text }).strict()).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    coverage: z
      .array(
        z
          .object({
            step: id,
            beatIds: z.array(id).min(1).max(60),
            start: z.number().min(0),
            end: z.number().positive(),
            framing: text,
            viewpoint: text,
            referenceIntent: z.enum(['none', 'identity', 'composition', 'transition', 'motion']),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

const round = (n) => Math.round(n * 1000) / 1000;
const close = (a, b) => Math.abs(a - b) <= 0.05;

function reviewProduction(workflow) {
  if (!workflow.production) return undefined; // Preserve older workflows and fingerprints.
  const p = workflow.production;
  const warnings = [];
  const beats = new Map();
  let beatEnd = 0;
  for (const beat of p.beats) {
    if (beats.has(beat.id)) fail(`Duplicate production beat: ${beat.id}`);
    if (!close(beat.start, beatEnd) || beat.end <= beat.start)
      fail(`Production beat ${beat.id} must follow the previous beat without gaps or overlaps.`);
    beats.set(beat.id, beat);
    beatEnd = beat.end;
    // A rough English delivery warning, not speech synthesis or a quality score.
    const words = beat.dialogue.reduce((n, line) => n + line.text.split(/\s+/).length, 0);
    if ((words / (beat.end - beat.start)) * 60 > 190)
      warnings.push(
        `${beat.id}: dialogue exceeds roughly 190 words/minute before pauses; rehearse or shorten it.`,
      );
    if (words > 0 && words <= 6 && beat.end - beat.start >= 5)
      warnings.push(
        `${beat.id}: very short dialogue occupies at least 5 seconds; verify the visible action earns the remaining time.`,
      );
  }
  if (!close(beatEnd, p.targetDuration)) fail('Production beats must fill targetDuration.');

  const sources = new Map(workflow.steps.map((s) => [s.id, s.request]));
  let editEnd = 0;
  const timeline = [];
  const used = new Set();
  const covered = new Set();
  for (const [index, clip] of p.coverage.entries()) {
    const r = sources.get(clip.step);
    if (!r || r.model === 'flare') fail(`Production coverage ${clip.step} must name a video step.`);
    if (clip.end <= clip.start || clip.end > r.duration)
      fail(`Production coverage ${clip.step} exceeds its source duration or is empty.`);
    const frames = Math.round((clip.end - clip.start) * 24);
    if (frames < 1) fail('Production coverage must retain at least one 24fps frame.');
    const end = editEnd + frames / 24;
    const expected = p.beats
      .filter((b) => Math.min(b.end, end) - Math.max(b.start, editEnd) > 1e-6)
      .map((b) => b.id);
    if (
      new Set(clip.beatIds).size !== clip.beatIds.length ||
      clip.beatIds.some((b) => !beats.has(b)) ||
      expected.length !== clip.beatIds.length ||
      expected.some((b) => !clip.beatIds.includes(b))
    )
      fail(
        `Production coverage ${clip.step} beatIds must match the beats at its position in the edit.`,
      );
    if (clip.referenceIntent === 'composition' && !['image', 'frames'].includes(r.mode))
      warnings.push(
        `${clip.step}: exact opening composition needs a shot-specific firstFrame; asset reference mode does not anchor the frame.`,
      );
    if (clip.referenceIntent === 'transition' && r.mode !== 'frames')
      warnings.push(`${clip.step}: a transition between two planned endpoints needs frames mode.`);
    if (clip.referenceIntent === 'motion' && !r.videos.length)
      warnings.push(
        `${clip.step}: no motion reference video is attached; a still image does not provide movement.`,
      );
    const previous = p.coverage[index - 1];
    if (
      previous &&
      previous.framing.toLowerCase() === clip.framing.toLowerCase() &&
      previous.viewpoint.toLowerCase() === clip.viewpoint.toLowerCase()
    )
      warnings.push(
        `${clip.step}: adjacent coverage repeats framing/viewpoint; check whether a new event or performance justifies the cut.`,
      );
    timeline.push({
      step: clip.step,
      beatIds: clip.beatIds,
      start: round(editEnd),
      end: round(end),
      sourceStart: clip.start,
      sourceEnd: clip.end,
    });
    editEnd = end;
    used.add(clip.step);
    for (const id of clip.beatIds) covered.add(id);
  }
  if (!close(editEnd, p.targetDuration))
    fail('Production coverage must fill targetDuration after 24fps rounding.');
  if (p.beats.some((b) => !covered.has(b.id))) fail('Every production beat needs video coverage.');
  for (const [name, r] of sources) {
    if (r.model !== 'flare' && !used.has(name))
      warnings.push(`${name}: a paid video source has no planned place in the edit.`);
  }
  if (workflow.compose) {
    const clips = workflow.compose.steps;
    if (
      clips.length !== p.coverage.length ||
      clips.some((clip, i) => {
        const c =
          typeof clip === 'string'
            ? { step: clip, start: 0, end: sources.get(clip)?.duration }
            : clip;
        const expected = p.coverage[i];
        return (
          c.step !== expected.step ||
          !close(c.start, expected.start) ||
          !close(c.end ?? sources.get(c.step)?.duration, expected.end)
        );
      })
    )
      fail(
        'Automatic compose must match production coverage; revise the plan or compose separately after inspection.',
      );
  }
  return {
    brand: p.brand,
    targetDuration: p.targetDuration,
    plannedDuration: round(editEnd),
    videoCalls: [...sources.values()].filter((r) => r.model !== 'flare').length,
    generatedVideoSeconds: [...sources.values()]
      .filter((r) => r.model !== 'flare')
      .reduce((n, r) => n + r.duration, 0),
    timeline,
    warnings,
    note: 'Checks timing, coverage and reference intent only. The agent must review story tension, prompt fidelity and the actual rendered cut; no engagement score is inferred.',
  };
}

module.exports = { productionSchema, reviewProduction };

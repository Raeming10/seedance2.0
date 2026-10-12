const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWorkflow } = require('../lib/engine');
const { reviewProduction } = require('../lib/production');
const example = require('../examples/prelulu-mafia-20s.json');
const fresh = () => structuredClone(example);

test('full script maps 20 edit seconds onto five 8-second Veo sources', () => {
  const plan = validateWorkflow(fresh());
  const review = reviewProduction(plan);
  assert.equal(review.brand, 'Prelulu');
  assert.equal(review.plannedDuration, 20);
  assert.equal(review.videoCalls, 5);
  assert.equal(review.generatedVideoSeconds, 40);
  assert.deepEqual(
    review.timeline.map((s) => [s.start, s.end]),
    [
      [0, 2],
      [2, 7],
      [7, 10],
      [10, 16],
      [16, 20],
    ],
  );
  assert.ok(review.warnings.some((s) => s.includes('pressure') && s.includes('short dialogue')));
  assert.ok(!review.warnings.some((s) => s.includes('firstFrame')));
});

test('production rejects broken beat timing, source coverage and mismatched provisional assembly', () => {
  const cases = [
    [
      (p) => {
        p.production.beats[1].start = 3;
      },
      /gaps or overlaps/,
    ],
    [
      (p) => {
        p.production.beats[1].id = 'hook';
      },
      /Duplicate production beat/,
    ],
    [
      (p) => {
        p.production.targetDuration = 21;
      },
      /fill targetDuration/,
    ],
    [
      (p) => {
        p.production.coverage[0].step = 'identity';
      },
      /video step/,
    ],
    [
      (p) => {
        p.production.coverage[0].step = 'missing';
      },
      /video step/,
    ],
    [
      (p) => {
        p.production.coverage[0].end = 9;
      },
      /source duration/,
    ],
    [
      (p) => {
        p.production.coverage[0].end = 0.51;
      },
      /24fps frame/,
    ],
    [
      (p) => {
        p.production.coverage[0].beatIds = ['turn'];
      },
      /beatIds/,
    ],
    [
      (p) => {
        p.production.coverage[0].beatIds = ['hook', 'hook'];
      },
      /beatIds/,
    ],
    [
      (p) => {
        p.production.coverage.at(-1).end = 4;
      },
      /fill targetDuration/,
    ],
    [
      (p) => {
        p.compose = { steps: ['hook'], resolution: '1080p', aspectRatio: '9:16' };
      },
      /match production coverage/,
    ],
  ];
  for (const [mutate, message] of cases) {
    const plan = fresh();
    mutate(plan);
    assert.throws(() => validateWorkflow(plan), message);
  }
});

test('reference intent and delivery issues warn without pretending to judge creative quality', () => {
  const plan = fresh();
  const shot = plan.steps.find((s) => s.id === 'turn').request;
  shot.mode = 'reference';
  shot.images = [shot.firstFrame];
  delete shot.firstFrame;
  plan.production.beats[3].dialogue[0].text = 'word '.repeat(30).trim();
  plan.production.coverage[3].framing = 'insert';
  plan.production.coverage[4].referenceIntent = 'motion';
  const review = reviewProduction(validateWorkflow(plan));
  assert.ok(review.warnings.some((s) => s.includes('turn: exact opening composition')));
  assert.ok(review.warnings.some((s) => s.includes('190 words/minute')));
  assert.ok(review.warnings.some((s) => s.includes('repeats framing')));
  assert.ok(review.warnings.some((s) => s.includes('no motion reference')));
});

test('a beat may use multiple ranges and the production plan can match automatic compose', () => {
  const plan = fresh();
  const clip = plan.production.coverage[0];
  plan.production.coverage.splice(0, 1, { ...clip, end: 1.5 }, { ...clip, start: 1.5 });
  plan.compose = {
    steps: plan.production.coverage.map(({ step, start, end }) => ({ step, start, end })),
    aspectRatio: '9:16',
    resolution: '1080p',
  };
  assert.equal(reviewProduction(validateWorkflow(plan)).plannedDuration, 20);
});

test('older and asset-only workflows preserve their shape without a production requirement', () => {
  const plan = validateWorkflow({
    name: 'A reference',
    steps: [{ id: 'hero', request: { model: 'flare', prompt: 'Cup' } }],
  });
  assert.equal('production' in plan, false);
  assert.equal(reviewProduction(plan), undefined);
});

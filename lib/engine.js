const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { normalize, estimate, fail } = require('./catalog');
const { ffmpegAvailable } = require('./media');
const { redact } = require('./config');
const { z } = require('zod');
const { requestSchema } = require('./catalog');
const { productionSchema, reviewProduction } = require('./production');
const {
  stepClipSchema,
  compositionFields,
  compositionSchema,
  parse,
  clipObject,
  stepId,
  resolveStepClip,
} = require('./timeline');
const workflowSchema = z
  .object({
    name: z.string().min(1).max(120),
    production: productionSchema.optional(),
    steps: z
      .array(
        z
          .object({ id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/), request: requestSchema })
          .strict(),
      )
      .min(1)
      .max(30),
    compose: z
      .object({
        steps: z.array(stepClipSchema).min(1).max(30),
        ...compositionFields,
      })
      .strict()
      .optional(),
  })
  .strict();
const terminal = new Set(['completed', 'failed', 'unknown', 'paused']);
const fingerprint = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
function mapMedia(r, fn) {
  const out = structuredClone(r);
  for (const k of ['images', 'videos', 'audios']) out[k] = (out[k] || []).map((v) => fn(v, k));
  for (const k of ['firstFrame', 'lastFrame']) if (out[k]) out[k] = fn(out[k], k);
  return out;
}
function validateWorkflow(value) {
  const parsed = workflowSchema.safeParse(value);
  if (!parsed.success)
    fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const w = parsed.data,
    seen = new Map();
  for (const step of w.steps) {
    if (seen.has(step.id)) fail(`Duplicate step ID: ${step.id}`);
    step.request = normalize(step.request);
    mapMedia(step.request, (v, field) => {
      if (!v.startsWith('@step:')) return v;
      const previous = seen.get(v.slice(6));
      if (!previous) fail(`Reference ${v} must name an earlier step.`);
      const expectImage = ['images', 'firstFrame', 'lastFrame'].includes(field);
      if (field === 'audios' || expectImage !== (previous.model === 'flare'))
        fail(`Reference ${v} has the wrong media type for ${field}.`);
      return v;
    });
    seen.set(step.id, step.request);
  }
  if (w.compose) {
    let editDuration = 0;
    for (const clip of w.compose.steps) {
      const id = stepId(clip);
      if (!seen.has(id) || seen.get(id).model === 'flare')
        fail(`Compose step ${id} must be a video step.`);
      if (
        typeof clip !== 'string' &&
        (clip.start >= seen.get(id).duration || (clip.end ?? 0) > seen.get(id).duration)
      )
        fail(`Compose range for ${id} exceeds its requested generation duration.`);
      const seconds =
        typeof clip === 'string'
          ? seen.get(id).duration
          : (clip.end ?? seen.get(id).duration) - clip.start;
      const frames = Math.round(seconds * 24);
      if (frames < 1) fail('Selected video range must contain at least one 24fps frame.');
      editDuration += frames / 24;
    }
    for (const track of w.compose.audioTracks || []) {
      let end = track.end;
      if (track.url.startsWith('@step:')) {
        const source = seen.get(track.url.slice(6));
        if (!source || source.model === 'flare' || !source.audio)
          fail('Audio track @step reference must name a video step with audio enabled.');
        if (track.start >= source.duration || (track.end ?? 0) > source.duration)
          fail('Audio track range exceeds its requested generation duration.');
        end ??= source.duration;
      }
      if (
        track.at >= editDuration ||
        (end !== undefined && track.at + end - track.start > editDuration + 0.05)
      )
        fail('Audio track must fit inside the video timeline.');
      if (end !== undefined && track.fadeIn + track.fadeOut > end - track.start)
        fail('Audio fades exceed the selected track duration.');
    }
  }
  reviewProduction(w);
  return w;
}
class Engine {
  constructor(root, providers, media, options = {}) {
    this.root = root;
    this.providers = providers;
    this.media = media;
    this.jobs = new Map();
    this.workflows = new Map();
    this.active = new Set();
    this.ffmpeg = options.ffmpeg ?? ffmpegAvailable();
    fs.mkdirSync(path.join(root, 'records'), { recursive: true });
    for (const name of fs
      .readdirSync(path.join(root, 'records'))
      .filter((n) => n.endsWith('.json'))) {
      const record = JSON.parse(fs.readFileSync(path.join(root, 'records', name), 'utf8'));
      if (record.type === 'job') {
        if (record.status === 'submitting') {
          record.status = 'unknown';
          record.error =
            'Server restarted during submission. Check provider history before creating a replacement; no automatic re-submit.';
        }
        if (record.status === 'preparing') record.status = 'pending';
        this.jobs.set(record.id, record);
      } else this.workflows.set(record.id, record);
    }
  }
  save(record) {
    record.updatedAt = new Date().toISOString();
    const p = path.join(this.root, 'records', record.id + '.json');
    fs.writeFileSync(p + '.tmp', JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(p + '.tmp', p);
  }
  public(record, compact = false) {
    const copy = structuredClone(record);
    delete copy.idempotencyKey;
    delete copy.fingerprint;
    delete copy.sourceUrls;
    if (record.request) copy.model = record.request.model;
    if (compact) {
      delete copy.request;
      delete copy.manifest;
    }
    return copy;
  }
  preflight(value) {
    const request = normalize(value);
    const needsFFmpeg = !request.audio && ['veo', 'minimax'].includes(request.model);
    if (needsFFmpeg && !this.ffmpeg)
      fail('Silent delivery requires FFmpeg. Install it, or keep the native audio.');
    // Check local files before any billable call.
    mapMedia(request, (v, field) => {
      if (v.startsWith('/')) {
        const p = this.media.localPath(v),
          ext = path.extname(p);
        const valid = ['images', 'firstFrame', 'lastFrame'].includes(field)
          ? ['.png', '.jpg', '.jpeg', '.webp']
          : field === 'videos'
            ? ['.mp4', '.mov']
            : ['.mp3', '.wav'];
        if (!valid.includes(ext)) fail(`Invalid media type for ${field}.`);
      } else if (
        !v.startsWith('@step:') &&
        !/^data:(image|video|audio)\/[^;]+;base64,[A-Za-z0-9+/]+=*$/.test(v)
      ) {
        let u;
        try {
          u = new URL(v);
        } catch {
          fail('Invalid reference URL.');
        }
        if (u.protocol !== 'https:' || u.username || u.password)
          fail('Reference URLs must use HTTPS without credentials.');
      }
      return v;
    });
    return { request, estimate: estimate(request), guide: `/api/guides/${request.model}` };
  }
  submit(value, key) {
    const { request, estimate: cost } = this.preflight(value);
    mapMedia(request, (v) => {
      if (v.startsWith('@step:')) fail('@step references require a workflow.');
      return v;
    });
    const hash = fingerprint(request);
    const previous = [...this.jobs.values()].find((j) => j.idempotencyKey === key);
    if (previous) {
      if (previous.fingerprint !== hash)
        fail('Idempotency key was already used for a different request.');
      return this.public(previous);
    }
    this.providers.check(request);
    const job = {
      type: 'job',
      id: randomUUID(),
      idempotencyKey: key,
      fingerprint: hash,
      request,
      estimate: cost,
      status: 'pending',
      createdAt: new Date().toISOString(),
      outputs: [],
    };
    this.jobs.set(job.id, job);
    this.save(job);
    return this.public(job);
  }
  previewWorkflow(value) {
    const manifest = validateWorkflow(value);
    if (manifest.compose && !this.ffmpeg) fail('Composing a video requires FFmpeg.');
    for (const track of manifest.compose?.audioTracks || [])
      if (!track.url.startsWith('@step:')) this.checkAudioTrack(track);
    const steps = manifest.steps.map((s) => ({ id: s.id, ...this.preflight(s.request) }));
    const known = steps.reduce((n, s) => n + (s.estimate.usd || 0), 0);
    return {
      manifest,
      steps,
      productionReview: reviewProduction(manifest),
      estimate: {
        knownUsd: Number(known.toFixed(4)),
        unpricedSteps: steps.filter((s) => s.estimate.usd === null).map((s) => s.id),
        note: 'Known portion only; image and variable reference costs are additional.',
      },
    };
  }
  createWorkflow(value, key) {
    const preview = this.previewWorkflow(value),
      hash = fingerprint(preview.manifest);
    const previous = [...this.workflows.values()].find((w) => w.idempotencyKey === key);
    if (previous) {
      if (previous.fingerprint !== hash)
        fail('Idempotency key was already used for another workflow.');
      return this.public(previous);
    }
    for (const s of preview.manifest.steps) this.providers.check(s.request);
    const w = {
      type: 'workflow',
      id: randomUUID(),
      name: preview.manifest.name,
      idempotencyKey: key,
      fingerprint: hash,
      manifest: preview.manifest,
      estimate: preview.estimate,
      status: 'running',
      steps: [],
      outputs: [],
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(w.id, w);
    this.save(w);
    return this.public(w);
  }
  composeExisting(value, key) {
    const c = parse(compositionSchema, value);
    if (!this.ffmpeg) fail('Composing a video requires FFmpeg.');
    for (const clip of c.clips)
      if (!this.media.localPath(clipObject(clip).url).endsWith('.mp4'))
        fail('Composition requires local MP4 clips.');
    for (const track of c.audioTracks || []) this.checkAudioTrack(track);
    const hash = fingerprint(c),
      previous = [...this.workflows.values()].find((w) => w.idempotencyKey === key);
    if (previous) {
      if (previous.fingerprint !== hash) fail('Idempotency key was already used.');
      return this.public(previous);
    }
    const w = {
      type: 'workflow',
      id: randomUUID(),
      name: c.name,
      composition: c,
      idempotencyKey: key,
      fingerprint: hash,
      status: 'composing',
      steps: [],
      outputs: [],
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(w.id, w);
    this.save(w);
    return this.public(w);
  }
  checkAudioTrack(track) {
    if (!/\.(mp3|wav|mp4|mov)$/.test(this.media.localPath(track.url)))
      fail('Audio tracks require local MP3, WAV, MP4 or MOV files.');
  }
  async previewComposition(value) {
    const c = parse(compositionSchema, value);
    if (!this.ffmpeg) fail('Composing a video requires FFmpeg.');
    return {
      composition: c,
      timeline: await this.media.planComposition(c.clips, c.audioTracks),
      generationCostUsd: 0,
    };
  }
  async advanceJob(j) {
    if (this.active.has(j.id) || terminal.has(j.status)) return;
    this.active.add(j.id);
    try {
      if (j.status === 'pending') {
        j.status = 'preparing';
        this.save(j);
        let prepared;
        try {
          prepared = await this.providers.prepare(j.request);
        } catch (e) {
          j.status = 'failed';
          j.error = redact(e.message);
          this.save(j);
          return;
        }
        j.status = 'submitting';
        this.save(j);
        try {
          j.receipt = await this.providers.submit(j.request, prepared);
          j.status = 'queued';
          this.save(j);
        } catch (e) {
          // A lost acknowledgement is not proof that a charged operation was rejected.
          j.status =
            e.upstreamStatus >= 400 &&
            e.upstreamStatus < 500 &&
            ![408, 429].includes(e.upstreamStatus)
              ? 'failed'
              : 'unknown';
          j.error = redact(e.message);
          this.save(j);
          return;
        }
      }
      if (!j.sourceUrls) {
        const state = await this.providers.poll(j.receipt);
        j.pollFailures = 0;
        delete j.pollError;
        if (state.status !== 'completed') {
          j.status = state.status;
          if (state.error) j.error = state.error;
          this.save(j);
          return;
        }
        j.sourceUrls = state.urls;
        j.status = 'downloading';
        this.save(j);
      }
      j.outputs = await this.media.saveResult(
        j.id,
        j.sourceUrls,
        j.request,
        process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      );
      j.status = 'completed';
      delete j.error;
      delete j.pollError;
      this.save(j);
    } catch (e) {
      // Polls/downloads are safe to resume and must never trigger another generation.
      j.pollError = redact(e.message);
      j.pollFailures = (j.pollFailures || 0) + 1;
      if (j.pollFailures >= 120) {
        j.status = 'paused';
        j.error =
          'Polling/download repeatedly failed. Resume this job to retry without generating again.';
      }
      this.save(j);
    } finally {
      this.active.delete(j.id);
    }
  }
  resume(id) {
    const j = this.jobs.get(id);
    if (!j || j.status !== 'paused' || !j.receipt)
      fail('Only paused jobs with a provider receipt can be resumed.');
    j.status = j.sourceUrls ? 'downloading' : 'queued';
    j.pollFailures = 0;
    delete j.error;
    this.save(j);
    for (const w of this.workflows.values())
      if (w.status === 'failed' && w.steps.some((s) => s.jobId === id && s.status === 'paused')) {
        w.status = 'running';
        delete w.error;
        this.save(w);
      }
    return this.public(j);
  }
  async advanceWorkflow(w) {
    if (this.active.has(w.id) || terminal.has(w.status)) return;
    this.active.add(w.id);
    try {
      if (w.composition) {
        const c = w.composition;
        w.outputs = [
          await this.media.compose(w.id, c.clips, c.aspectRatio, c.resolution, c.audioTracks),
        ];
        w.status = 'completed';
        this.save(w);
        return;
      }
      for (const step of w.manifest.steps) {
        let state = w.steps.find((s) => s.id === step.id);
        if (!state) {
          const request = mapMedia(step.request, (v) => {
            if (!v.startsWith('@step:')) return v;
            const dependency = w.steps.find((s) => s.id === v.slice(6));
            return this.jobs.get(dependency.jobId).outputs[0].url;
          });
          const job = this.submit(request, `${w.id}:${step.id}`);
          state = { id: step.id, jobId: job.id, status: job.status };
          w.steps.push(state);
          this.save(w);
          return;
        }
        const job = this.jobs.get(state.jobId);
        state.status = job.status;
        if (terminal.has(job.status) && job.status !== 'completed') {
          w.status = 'failed';
          w.error = `Step ${step.id}: ${job.error || job.status}`;
          this.save(w);
          return;
        }
        if (job.status !== 'completed') {
          this.save(w);
          return;
        }
      }
      const completed = Object.fromEntries(
        w.steps.map((s) => [s.id, this.jobs.get(s.jobId).outputs[0]]),
      );
      if (w.manifest.compose) {
        w.status = 'composing';
        this.save(w);
        const c = w.manifest.compose;
        w.outputs = [
          await this.media.compose(
            w.id,
            c.steps.map((clip) => resolveStepClip(clip, completed)),
            c.aspectRatio,
            c.resolution,
            c.audioTracks?.map((track) => ({
              ...track,
              url: track.url.startsWith('@step:') ? completed[track.url.slice(6)].url : track.url,
            })),
          ),
        ];
      } else w.outputs = Object.values(completed);
      w.status = 'completed';
      this.save(w);
    } catch (e) {
      w.status = 'failed';
      w.error = redact(e.message);
      this.save(w);
    } finally {
      this.active.delete(w.id);
    }
  }
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const jobs = [...this.jobs.values()].filter((j) => !terminal.has(j.status));
      // Round-robin avoids a long queue starving later jobs.
      this.cursor = (this.cursor || 0) % Math.max(jobs.length, 1);
      const batch = [...jobs.slice(this.cursor), ...jobs.slice(0, this.cursor)].slice(0, 4);
      this.cursor += batch.length;
      await Promise.allSettled(batch.map((j) => this.advanceJob(j)));
      for (const w of this.workflows.values()) await this.advanceWorkflow(w);
    } finally {
      this.ticking = false;
    }
  }
  start() {
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error(redact(e.message))),
      5000,
    );
    this.timer.unref();
    void this.tick();
  }
  stop() {
    clearInterval(this.timer);
  }
}
module.exports = { Engine, validateWorkflow, workflowSchema, compositionSchema, mapMedia };

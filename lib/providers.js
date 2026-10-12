const fs = require('node:fs');
const path = require('node:path');
const { createFalClient } = require('@fal-ai/client');
const { GoogleGenAI } = require('@google/genai');
const { falRequest, fail, modelById } = require('./catalog');
const { MIME } = require('./media');
const { redact } = require('./config');

class Providers {
  constructor(media) {
    this.media = media;
    this.fal = createFalClient({ credentials: () => process.env.FAL_KEY });
  }
  check(request) {
    const key =
      modelById(request.model).provider === 'fal' ? 'FAL_KEY' : 'GOOGLE_GENERATIVE_AI_API_KEY';
    if (!process.env[key]) {
      const e = new Error(`Missing ${key}. Add it to the server .env file.`);
      e.status = 503;
      throw e;
    }
  }
  google() {
    return new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      httpOptions: { timeout: 120000, retryOptions: { attempts: 1 } },
    });
  }
  async falJson(url, options = {}) {
    const u = new URL(url);
    if (u.origin !== 'https://queue.fal.run') fail('Invalid fal queue URL.');
    const res = await fetch(u, {
      ...options,
      redirect: 'error',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(redact(JSON.stringify(data.detail || data.error || data)));
      e.upstreamStatus = res.status;
      throw e;
    }
    return data;
  }
  async falMedia(value) {
    if (value.startsWith('/')) {
      const p = this.media.localPath(value);
      return this.fal.storage.upload(
        new File([fs.readFileSync(p)], path.basename(p), { type: MIME[path.extname(p)] }),
      );
    }
    if (value.startsWith('data:')) return value;
    let u;
    try {
      u = new URL(value);
    } catch {
      fail('Use a local asset URL, HTTPS URL or data URI.');
    }
    if (u.protocol !== 'https:' || u.username || u.password)
      fail('Reference URLs must use HTTPS without credentials.');
    return value;
  }
  async prepare(request) {
    if (request.model === 'veo') {
      const config = {
        aspectRatio: request.aspectRatio,
        durationSeconds: request.duration,
        resolution: request.resolution,
        numberOfVideos: 1,
      };
      if (request.lastFrame) config.lastFrame = await this.media.image(request.lastFrame);
      if (request.mode === 'reference')
        config.referenceImages = await Promise.all(
          request.images.map(async (image) => ({
            image: await this.media.image(image),
            referenceType: 'asset',
          })),
        );
      return {
        model: 'veo-3.1-generate-preview',
        prompt: request.prompt,
        config,
        ...(request.firstFrame ? { image: await this.media.image(request.firstFrame) } : {}),
      };
    }
    const r = structuredClone(request),
      cache = new Map();
    const convert = (value) => {
      if (!cache.has(value)) cache.set(value, this.falMedia(value));
      return cache.get(value);
    };
    for (const name of ['images', 'videos', 'audios'])
      r[name] = await Promise.all(r[name].map(convert));
    for (const name of ['firstFrame', 'lastFrame']) if (r[name]) r[name] = await convert(r[name]);
    return falRequest(r);
  }
  async submit(request, prepared) {
    if (request.model === 'veo') {
      let operation;
      try {
        operation = await this.google().models.generateVideos(prepared);
      } catch (e) {
        e.upstreamStatus = e.status;
        throw e;
      }
      if (!operation.name) throw new Error('Google did not return an operation ID.');
      return { provider: 'google', name: operation.name };
    }
    const response = await this.falJson(`https://queue.fal.run/${prepared.endpoint}`, {
      method: 'POST',
      body: JSON.stringify(prepared.input),
    });
    if (!response.request_id || !response.status_url || !response.response_url)
      throw new Error('fal did not return a complete queue receipt.');
    return {
      provider: 'fal',
      requestId: response.request_id,
      endpoint: prepared.endpoint,
      statusUrl: response.status_url,
      resultUrl: response.response_url,
    };
  }
  async poll(receipt) {
    if (receipt.provider === 'google') {
      const op = await this.google().operations.getVideosOperation({
        operation: { name: receipt.name },
      });
      if (op.error) return { status: 'failed', error: redact(JSON.stringify(op.error)) };
      if (!op.done) return { status: 'running' };
      const urls = op.response?.generatedVideos?.map((v) => v.video?.uri).filter(Boolean) || [];
      return urls.length
        ? { status: 'completed', urls }
        : {
            status: 'failed',
            error:
              'Google returned no video. ' +
              (op.response?.raiMediaFilteredReasons || []).join('; '),
          };
    }
    const status = await this.falJson(receipt.statusUrl);
    if (status.status === 'IN_QUEUE') return { status: 'queued' };
    if (status.status === 'IN_PROGRESS') return { status: 'running' };
    if (status.status !== 'COMPLETED')
      return {
        status: 'failed',
        error: redact(status.error || `Unexpected provider state: ${status.status}`),
      };
    let data;
    try {
      data = await this.falJson(receipt.resultUrl);
    } catch (e) {
      if (e.upstreamStatus >= 400 && e.upstreamStatus < 500 && e.upstreamStatus !== 429)
        return { status: 'failed', error: e.message };
      throw e;
    }
    const urls = data.images?.map((i) => i.url) || (data.video?.url ? [data.video.url] : []);
    return urls.length
      ? { status: 'completed', urls }
      : { status: 'failed', error: 'Provider returned no media.' };
  }
}
module.exports = { Providers };

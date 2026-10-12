const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { fail } = require('./catalog');
const { compositionSchema, parse, clipObject } = require('./timeline');
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const MAX_MEDIA = 512 * 1024 * 1024;
function probePath() {
  return (
    process.env.FFPROBE_PATH ||
    (process.env.FFMPEG_PATH
      ? path.join(
          path.dirname(process.env.FFMPEG_PATH),
          process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
        )
      : 'ffprobe')
  );
}
function ffmpegAvailable() {
  return [process.env.FFMPEG_PATH || 'ffmpeg', probePath()].every(
    (p) => spawnSync(p, ['-version'], { stdio: 'ignore' }).status === 0,
  );
}
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.env.FFMPEG_PATH || 'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let error = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), 10 * 60 * 1000);
    p.stderr.on('data', (b) => {
      error = (error + b).slice(-2000);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${error}`));
    });
  });
}
function allowedDownload(value, google = false) {
  let u;
  try {
    u = new URL(value);
  } catch {
    fail('Invalid media URL.');
  }
  const host = u.hostname;
  const fal =
    host === 'fal.media' ||
    host.endsWith('.fal.media') ||
    (host === 'storage.googleapis.com' && u.pathname.startsWith('/falserverless/'));
  const g =
    google &&
    (host === 'generativelanguage.googleapis.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'storage.googleapis.com');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !(fal || g))
    fail('Media download host is not trusted. Upload your file through /api/assets first.');
  return u;
}
async function fetchMedia(url, { google = false, key, maxBytes = MAX_MEDIA } = {}) {
  for (let i = 0; i < 6; i++) {
    const u = allowedDownload(url, google);
    const headers =
      key && u.hostname === 'generativelanguage.googleapis.com' ? { 'x-goog-api-key': key } : {};
    const res = await fetch(u, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(180000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      url = new URL(res.headers.get('location'), u).href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Media download failed: HTTP ${res.status}`);
    }
    if (Number(res.headers.get('content-length')) > maxBytes) {
      await res.body?.cancel();
      fail('Media is too large.');
    }
    return res;
  }
  throw new Error('Too many media redirects.');
}
function limitStream(max = MAX_MEDIA) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _, cb) {
      bytes += chunk.length;
      cb(bytes > max ? new Error('Media size limit exceeded.') : null, chunk);
    },
  });
}
async function download(url, target, options) {
  const res = await fetchMedia(url, options);
  try {
    await pipeline(
      Readable.fromWeb(res.body),
      limitStream(options?.maxBytes),
      fs.createWriteStream(target + '.part'),
    );
    fs.renameSync(target + '.part', target);
  } catch (e) {
    fs.rmSync(target + '.part', { force: true });
    throw e;
  }
}
class MediaStore {
  constructor(root) {
    this.root = root;
    for (const d of ['assets', 'outputs']) fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  localPath(url) {
    if (!/^\/(assets|outputs)\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|mp4|mov|mp3|wav)$/.test(url))
      fail('Invalid local asset URL.');
    const file = path.join(this.root, url.slice(1));
    if (!fs.existsSync(file)) fail('Local asset not found.');
    return file;
  }
  async importStream(stream, extension) {
    if (!MIME[extension])
      fail('Unsupported media format. Use PNG, JPG, WebP, MP4, MOV, MP3 or WAV.');
    const url = `/assets/${randomUUID()}${extension}`,
      target = path.join(this.root, url.slice(1));
    try {
      await pipeline(stream, limitStream(), fs.createWriteStream(target + '.part'));
      fs.renameSync(target + '.part', target);
    } catch (e) {
      fs.rmSync(target + '.part', { force: true });
      throw e;
    }
    return { url, bytes: fs.statSync(target).size };
  }
  async image(value) {
    let buffer, mime;
    if (value.startsWith('/')) {
      const p = this.localPath(value);
      buffer = fs.readFileSync(p);
      mime = MIME[path.extname(p)];
    } else if (value.startsWith('data:')) {
      const m = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/);
      if (!m) fail('Invalid image data URI.');
      mime = m[1];
      buffer = Buffer.from(m[2], 'base64');
    } else {
      const res = await fetchMedia(value, { maxBytes: 20 * 1024 * 1024 });
      const chunks = [];
      for await (const b of Readable.fromWeb(res.body).pipe(limitStream(20 * 1024 * 1024)))
        chunks.push(b);
      buffer = Buffer.concat(chunks);
      mime = res.headers.get('content-type')?.split(';')[0];
    }
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
      buffer.length > 20 * 1024 * 1024
    )
      fail('Use a PNG/JPEG/WebP image under 20 MB.');
    return { imageBytes: buffer.toString('base64'), mimeType: mime };
  }
  async saveResult(id, urls, request, googleKey) {
    const outputs = [];
    for (let i = 0; i < urls.length; i++) {
      const ext = request.model === 'flare' ? '.png' : '.mp4';
      const name = `${id}-${i}${ext}`,
        target = path.join(this.root, 'outputs', name);
      if (!fs.existsSync(target))
        await download(urls[i], target, { google: request.model === 'veo', key: googleKey });
      let delivered = name;
      if (ext === '.mp4' && !request.audio && request.model !== 'seedance') {
        delivered = `${id}-${i}-delivery.mp4`;
        const destination = path.join(this.root, 'outputs', delivered);
        if (!fs.existsSync(destination)) {
          const args = [
            '-i',
            target,
            '-c:v',
            'copy',
            '-an',
            '-movflags',
            '+faststart',
            destination + '.tmp.mp4',
          ];
          await runFFmpeg(args);
          fs.renameSync(destination + '.tmp.mp4', destination);
        }
      }
      outputs.push({
        url: `/outputs/${delivered}`,
        sourceUrl: `/outputs/${name}`,
        kind: ext === '.png' ? 'image' : 'video',
        resolution: request.resolution,
      });
    }
    return outputs;
  }
  async probe(url) {
    const file = this.localPath(url);
    const { stdout } = await promisify(execFile)(
      probePath(),
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const metadata = JSON.parse(stdout);
    const video = metadata.streams.find((s) => s.codec_type === 'video');
    const audio = metadata.streams.find((s) => s.codec_type === 'audio');
    const duration = Number(video?.duration || metadata.format.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
      fail('Invalid media duration (must be between 0 and 600 seconds).');
    return {
      duration,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      width: video?.width,
      height: video?.height,
    };
  }
  async planComposition(clips, audioTracks) {
    const c = parse(compositionSchema, {
      name: 'Timeline',
      clips,
      ...(audioTracks ? { audioTracks } : {}),
    });
    const cache = new Map();
    const probe = async (url) => {
      if (!cache.has(url)) cache.set(url, await this.probe(url));
      return cache.get(url);
    };
    const range = (edit, metadata) => {
      const end = edit.end ?? metadata.duration;
      if (edit.start >= metadata.duration || end > metadata.duration + 0.05)
        fail(`Edit range exceeds source duration for ${edit.url}.`);
      return { ...edit, end: Math.min(end, metadata.duration), sourceDuration: metadata.duration };
    };
    let duration = 0;
    const shots = [];
    for (const item of c.clips) {
      const clip = clipObject(item);
      if (!this.localPath(clip.url).endsWith('.mp4')) fail('Composition requires local MP4 clips.');
      const metadata = await probe(clip.url);
      if (!metadata.hasVideo) fail('Clip has no video stream.');
      const edit = range(clip, metadata);
      const frames = Math.round((edit.end - edit.start) * 24);
      if (frames < 1) fail('Selected video range must contain at least one 24fps frame.');
      shots.push({
        ...edit,
        duration: frames / 24,
        timelineStart: duration,
        hasAudio: metadata.hasAudio,
      });
      duration += frames / 24;
    }
    const tracks = [];
    for (const track of c.audioTracks || []) {
      if (!/\.(mp3|wav|mp4|mov)$/.test(this.localPath(track.url)))
        fail('Audio tracks require local MP3, WAV, MP4 or MOV files.');
      const metadata = await probe(track.url);
      if (!metadata.hasAudio) fail(`Audio track has no audio stream: ${track.url}.`);
      const edit = range(track, metadata);
      const length = edit.end - edit.start;
      if (edit.at >= duration || edit.at + length > duration + 0.05)
        fail('Audio track must fit inside the video timeline. Trim end or move at earlier.');
      if (edit.fadeIn + edit.fadeOut > length)
        fail('Audio fades exceed the selected track duration.');
      tracks.push({ ...edit, duration: length });
    }
    return { fps: 24, duration, clips: shots, audioTracks: tracks };
  }
  async inspect(url, times) {
    if (!/\.(mp4|mov)$/.test(this.localPath(url))) fail('Inspect requires a local MP4 or MOV.');
    const metadata = await this.probe(url);
    if (!metadata.hasVideo) fail('No video stream to inspect.');
    const last = Math.max(0, metadata.duration - 0.1);
    const selected =
      times === undefined
        ? [
            ...new Set(
              [
                0,
                0.5,
                1,
                2,
                3,
                ...Array.from({ length: 7 }, (_, i) => (last * (i + 1)) / 7),
              ].filter((t) => t <= last),
            ),
          ].sort((a, b) => a - b)
        : times;
    if (
      !Array.isArray(selected) ||
      !selected.length ||
      selected.length > 24 ||
      selected.some((t) => !Number.isFinite(t) || t < 0 || t >= metadata.duration)
    )
      fail('Inspect needs 1–24 timestamps within the video duration.');
    const id = randomUUID();
    const frames = [];
    try {
      for (let i = 0; i < selected.length; i++) {
        const frameUrl = `/outputs/${id}-frame-${i}.jpg`;
        frames.push({ time: selected[i], url: frameUrl });
        await runFFmpeg([
          '-ss',
          String(selected[i]),
          '-i',
          this.localPath(url),
          '-frames:v',
          '1',
          '-vf',
          'scale=480:-2',
          path.join(this.root, frameUrl.slice(1)),
        ]);
        if (!fs.existsSync(path.join(this.root, frameUrl.slice(1))))
          fail('No frame available at the requested timestamp.');
      }
      return {
        source: url,
        ...metadata,
        frames,
        note: 'Frames support visual review only. Play the video to assess motion, cuts, dialogue and sound; no automatic quality score is assigned.',
      };
    } catch (e) {
      for (const frame of frames)
        fs.rmSync(path.join(this.root, frame.url.slice(1)), { force: true });
      throw e;
    }
  }
  async compose(id, clips, ratio = '9:16', resolution = '1080p', audioTracks) {
    const plan = await this.planComposition(clips, audioTracks);
    const [rw, rh] = ratio.split(':').map(Number),
      edge = resolution === '2k' ? 1440 : resolution === '720p' ? 720 : 1080;
    const w = Math.round((rw >= rh ? (edge * rw) / rh : edge) / 2) * 2;
    const h = Math.round((rw >= rh ? edge : (edge * rh) / rw) / 2) * 2;
    const normalized = [];
    const list = path.join(this.root, 'outputs', `${id}-concat.txt`);
    const joined = path.join(this.root, 'outputs', `${id}-joined.mp4`);
    const target = path.join(this.root, 'outputs', `${id}.mp4`);
    const temporary = target + '.tmp.mp4';
    try {
      for (let i = 0; i < plan.clips.length; i++) {
        const clip = plan.clips[i];
        const part = path.join(this.root, 'outputs', `${id}-part-${i}.mp4`);
        normalized.push(part);
        await runFFmpeg([
          '-ss',
          String(clip.start),
          '-i',
          this.localPath(clip.url),
          ...(!clip.hasAudio
            ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
            : []),
          '-map',
          '0:v:0',
          '-map',
          clip.hasAudio ? '0:a:0' : '1:a:0',
          '-vf',
          `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=0.05`,
          '-af',
          `volume=${clip.volume},apad`,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-t',
          String(clip.duration),
          part,
        ]);
      }
      fs.writeFileSync(list, normalized.map((f) => `file '${path.basename(f)}'`).join('\n'));
      // Decode audio across boundaries to avoid accumulating AAC padding per cut.
      await runFFmpeg([
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        list,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-af',
        'aresample=async=1:first_pts=0',
        '-t',
        String(plan.duration),
        '-movflags',
        '+faststart',
        joined,
      ]);
      if (plan.audioTracks.length) {
        const inputs = ['-i', joined];
        const filters = ['[0:a]asetpts=PTS-STARTPTS[base]'];
        for (let i = 0; i < plan.audioTracks.length; i++) {
          const track = plan.audioTracks[i];
          inputs.push('-i', this.localPath(track.url));
          const effects = [
            `atrim=start=${track.start}:end=${track.end}`,
            'asetpts=PTS-STARTPTS',
            'aresample=48000',
            `volume=${track.volume}`,
          ];
          if (track.fadeIn) effects.push(`afade=t=in:d=${track.fadeIn}`);
          if (track.fadeOut)
            effects.push(`afade=t=out:st=${track.duration - track.fadeOut}:d=${track.fadeOut}`);
          effects.push(`adelay=${Math.round(track.at * 1000)}:all=1`);
          filters.push(`[${i + 1}:a:0]${effects.join(',')}[track${i}]`);
        }
        const labels = '[base]' + plan.audioTracks.map((_, i) => `[track${i}]`).join('');
        filters.push(
          `${labels}amix=inputs=${plan.audioTracks.length + 1}:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[mix]`,
        );
        await runFFmpeg([
          ...inputs,
          '-filter_complex',
          filters.join(';'),
          '-map',
          '0:v:0',
          '-map',
          '[mix]',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-t',
          String(plan.duration),
          '-movflags',
          '+faststart',
          temporary,
        ]);
      } else fs.renameSync(joined, temporary);
      fs.renameSync(temporary, target);
      return { url: `/outputs/${id}.mp4`, kind: 'video', resolution, duration: plan.duration };
    } finally {
      for (const f of [...normalized, list, joined, temporary]) fs.rmSync(f, { force: true });
    }
  }
}
module.exports = { MediaStore, MIME, ffmpegAvailable, runFFmpeg, allowedDownload };

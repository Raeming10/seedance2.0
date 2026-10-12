const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { fail } = require('./catalog');
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
  async compose(id, urls, ratio = '9:16', resolution = '1080p') {
    if (!urls.length || urls.length > 30) fail('Compose requires 1–30 local video clips.');
    const [rw, rh] = ratio.split(':').map(Number),
      edge = resolution === '2k' ? 1440 : resolution === '720p' ? 720 : 1080;
    const w = Math.round((rw >= rh ? (edge * rw) / rh : edge) / 2) * 2;
    const h = Math.round((rw >= rh ? edge : (edge * rh) / rw) / 2) * 2;
    const normalized = [];
    try {
      for (let i = 0; i < urls.length; i++) {
        const source = this.localPath(urls[i]);
        if (!source.endsWith('.mp4')) fail('Compose only accepts generated MP4 clips.');
        const target = path.join(this.root, 'outputs', `${id}-part-${i}.mp4`);
        normalized.push(target);
        const { stdout } = await promisify(execFile)(
          probePath(),
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_type,duration:format=duration',
            '-of',
            'json',
            source,
          ],
          { timeout: 30000 },
        );
        const metadata = JSON.parse(stdout);
        const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
        const duration = Number(
          metadata.streams.find((s) => s.codec_type === 'video')?.duration ||
            metadata.format.duration,
        );
        if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
          fail('Invalid clip duration.');
        // Exactly one stereo stream in every segment; pad short/missing audio to video length.
        await runFFmpeg([
          '-i',
          source,
          ...(!hasAudio
            ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
            : []),
          '-map',
          '0:v:0',
          '-map',
          hasAudio ? '0:a:0' : '1:a:0',
          '-vf',
          `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
          '-af',
          'apad',
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
          String(duration),
          target,
        ]);
      }
      const list = path.join(this.root, 'outputs', `${id}-concat.txt`);
      fs.writeFileSync(list, normalized.map((f) => `file '${path.basename(f)}'`).join('\n'));
      const target = path.join(this.root, 'outputs', `${id}.mp4`);
      try {
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
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          target + '.tmp.mp4',
        ]);
        fs.renameSync(target + '.tmp.mp4', target);
      } finally {
        fs.rmSync(list, { force: true });
      }
      return { url: `/outputs/${id}.mp4`, kind: 'video', resolution };
    } finally {
      for (const f of normalized) fs.rmSync(f, { force: true });
    }
  }
}
module.exports = { MediaStore, MIME, ffmpegAvailable, runFFmpeg, allowedDownload };

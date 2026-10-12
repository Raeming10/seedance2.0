const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { MediaStore, runFFmpeg, ffmpegAvailable } = require('../lib/media');
test(
  'FFmpeg concatenates sound and silent clips into one playable video with exactly one audio track',
  { skip: !ffmpegAvailable(), timeout: 30000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-media-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = new MediaStore(root);
    const first = path.join(root, 'outputs', 'sound.mp4'),
      second = path.join(root, 'outputs', 'silent.mp4');
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=160x90:r=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '0.5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      first,
    ]);
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=90x160:r=24',
      '-t',
      '0.5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      second,
    ]);
    const out = await media.compose(
      'film',
      ['/outputs/sound.mp4', '/outputs/silent.mp4'],
      '9:16',
      '720p',
    );
    assert.equal(out.url, '/outputs/film.mp4');
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', media.localPath(out.url)],
        { encoding: 'utf8' },
      ),
    );
    const video = probe.streams.find((s) => s.codec_type === 'video');
    assert.equal(video.width, 720);
    assert.equal(video.height, 1280);
    assert.equal(probe.streams.filter((s) => s.codec_type === 'audio').length, 1);
    assert.ok(
      Number(probe.format.duration) >= 1 && Number(probe.format.duration) < 1.3,
      `duration=${probe.format.duration}`,
    );
  },
);
test(
  'Veo silent delivery preserves native 1080p and strips audio without re-downloading the source',
  { skip: !ffmpegAvailable(), timeout: 30000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-veo-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = new MediaStore(root),
      source = path.join(root, 'outputs', 'veo-test-0.mp4');
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=1080x1920:r=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '0.1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      source,
    ]);
    const out = await media.saveResult('veo-test', ['https://never-download.invalid/video'], {
      model: 'veo',
      resolution: '1080p',
      aspectRatio: '9:16',
      audio: false,
    });
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-of', 'json', media.localPath(out[0].url)],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(probe.streams[0].width, 1080);
    assert.equal(probe.streams[0].height, 1920);
    assert.equal(probe.streams.length, 1);
  },
);

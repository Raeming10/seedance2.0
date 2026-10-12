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

function pixel(file, at) {
  return [
    ...execFileSync('ffmpeg', [
      '-v',
      'error',
      '-ss',
      String(at),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'scale=1:1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ]),
  ];
}
function rms(file, at) {
  const bytes = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(at),
    '-i',
    file,
    '-t',
    '0.05',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '48000',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  let energy = 0;
  for (let i = 0; i < bytes.length; i += 4) energy += bytes.readFloatLE(i) ** 2;
  return Math.sqrt(energy / (bytes.length / 4));
}
test(
  'timeline trims the requested source moments, reorders shots, mutes and bridges audio without extending the cut',
  { skip: !ffmpegAvailable(), timeout: 30000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-edit-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = new MediaStore(root);
    const source = path.join(root, 'outputs', 'source.mp4');
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=160x90:r=24:d=1[r];color=c=blue:s=160x90:r=24:d=1[b];color=c=yellow:s=160x90:r=24:d=1[y];[r][b][y]concat=n=3:v=1:a=0',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      source,
    ]);
    const clips = [
      { url: '/outputs/source.mp4', start: 1.25, end: 1.75, volume: 0 },
      { url: '/outputs/source.mp4', start: 0.25, end: 0.75, volume: 0 },
    ];
    const tracks = [
      {
        url: '/outputs/source.mp4',
        start: 2,
        end: 2.5,
        at: 0.25,
        volume: 0.5,
        fadeIn: 0.1,
        fadeOut: 0.1,
      },
    ];
    const before = fs.readFileSync(source);
    const plan = await media.planComposition(clips, tracks);
    assert.equal(plan.duration, 1);
    assert.equal(plan.clips[1].timelineStart, 0.5);
    assert.equal(fs.readdirSync(path.join(root, 'outputs')).length, 1, 'preview does not render');
    const out = await media.compose('cut', clips, '16:9', '720p', tracks);
    const file = media.localPath(out.url);
    const first = pixel(file, 0.1),
      second = pixel(file, 0.7);
    assert.ok(first[2] > 200 && first[0] < 40, `first frame must be source blue: ${first}`);
    assert.ok(second[0] > 200 && second[2] < 40, `second frame must be source red: ${second}`);
    const meta = await media.probe(out.url);
    assert.ok(Math.abs(meta.duration - 1) <= 1 / 24, `cut duration=${meta.duration}`);
    assert.ok(rms(file, 0.08) < 0.0001, 'muted source remains silent before the bridge');
    assert.ok(rms(file, 0.4) > 0.015, 'independent audio starts before the picture cut');
    assert.ok(rms(file, 0.55) > 0.015, 'sound continues across the picture cut');
    assert.ok(rms(file, 0.87) < 0.0001, 'sound ends at the requested timeline position');
    assert.ok(rms(file, 0.26) < rms(file, 0.4), 'fade-in attenuates the beginning');
    assert.ok(rms(file, 0.69) < rms(file, 0.55), 'fade-out attenuates the end');
    assert.deepEqual(fs.readFileSync(source), before, 'source remains untouched');
    assert.deepEqual(fs.readdirSync(path.join(root, 'outputs')).sort(), ['cut.mp4', 'source.mp4']);
    const inspection = await media.inspect(out.url, [0.1, 0.7]);
    assert.equal(inspection.frames.length, 2);
    assert.equal(inspection.frames[1].time, 0.7);
    assert.ok(pixel(media.localPath(inspection.frames[0].url), 0)[2] > 200);
    assert.ok(pixel(media.localPath(inspection.frames[1].url), 0)[0] > 200);
    for (const bad of [[-1], [1], [], [NaN], Array(25).fill(0)])
      await assert.rejects(media.inspect(out.url, bad), /timestamps/);
    for (const bad of [
      [{ url: '/outputs/source.mp4', start: 2, end: 4 }],
      [{ url: '/outputs/source.mp4', start: 1, end: 1.001 }],
      [{ url: '/outputs/source.mp4', start: 2, end: 1 }],
      [{ url: 'https://example.com/clip.mp4' }],
    ])
      await assert.rejects(media.planComposition(bad));
    await assert.rejects(media.planComposition(clips, [{ ...tracks[0], at: 0.7 }]), /fit inside/);
    await assert.rejects(
      media.planComposition(clips, [{ ...tracks[0], fadeIn: 0.5 }]),
      /fades exceed/,
    );
  },
);

test(
  'silent clips accept independent WAV audio and repeated cuts do not accumulate timing drift',
  { skip: !ffmpegAvailable(), timeout: 30000 },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-audio-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const media = new MediaStore(root);
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=green:s=160x90:r=24',
      '-t',
      '1',
      '-c:v',
      'libx264',
      path.join(root, 'assets', 'silent.mp4'),
    ]);
    await runFFmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=48000',
      '-t',
      '3',
      path.join(root, 'assets', 'tone.wav'),
    ]);
    const clips = Array.from({ length: 12 }, () => ({
      url: '/assets/silent.mp4',
      start: 0.25,
      end: 0.5,
    }));
    const tracks = [{ url: '/assets/tone.wav', end: 3, volume: 0.25 }];
    const out = await media.compose('repeat', clips, '16:9', '720p', tracks);
    const meta = await media.probe(out.url);
    assert.ok(Math.abs(meta.duration - 3) <= 1 / 24, `duration drift: ${meta.duration}`);
    assert.ok(rms(media.localPath(out.url), 2.8) > 0.005);
    await assert.rejects(
      media.planComposition(clips, [{ url: '/assets/silent.mp4', end: 1 }]),
      /no audio stream/,
    );
  },
);

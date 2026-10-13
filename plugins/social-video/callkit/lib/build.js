// One config -> one finished video. See docs/GUIDE.md for the config and the six formats.
const fs = require('node:fs');
const path = require('node:path');
const { FPS, ffmpeg, duration, loudness, place, round } = require('./util');
const { analyseClip } = require('./align');
const { planCall, planStory } = require('./plan');
const { cutCallAudio, levelVoice, roomTone, sfxTrack, mix, mux } = require('./audio');
const { renderPicture, stills, KIT } = require('./render');

const ASSETS = path.join(KIT, 'assets');
const FORMATS = ['story', 'cards-first', 'call-first', 'incoming', 'chat', 'pov', 'mockup'];
const RING = new Set(['cards-first', 'call-first']);

/** Copy for each format when the config gives none: editable, and limited to supported product claims. */
const DEFAULTS = {
  story: { povText: '', povSeconds: 3, pip: false, intro: 0, music: false },
  'cards-first': { headline: 'Pick who calls you tonight.', subline: 'Real-time video calls' },
  'call-first': {
    headline: 'Video call your book boyfriend.',
    subline: 'He talks back, in real time',
  },
  incoming: { intro: 2.7, headline: "Guess who can't sleep either." },
  chat: {
    intro: 4.3,
    ringAt: 3.3,
    messages: [
      { from: 'her', text: "long day. can't sleep 😮‍💨", at: 0 },
      { from: 'him', text: 'Then don’t. Stay up with me a little.', at: 1.25 },
      { from: 'him', text: 'Can I see you?', at: 2.45 },
    ],
  },
  pov: {
    povText: 'POV: the house is finally quiet… and he calls just to see you',
    povSeconds: 3.0,
  },
  mockup: {
    headline: 'Late-night calls with him.',
    subline: 'Face to face, in real time',
    chips: [
      { text: 'Live video call', at: 0.9 },
      { text: 'He talks back', at: 3.0 },
      { text: 'Up when you are', at: 5.2 },
    ],
  },
};
// Frames between her tap on "accept" and the call: the ringing screen needs a beat to clear; the
// chat opens the call straight out of the button.
const TAP_LEAD = { incoming: 12, chat: 4 };

function load(configFile) {
  const file = path.resolve(configFile);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(file);
  const abs = (p) => (p && typeof p === 'string' ? path.resolve(dir, p) : p);
  if (!FORMATS.includes(cfg.format))
    throw new Error(`"format" must be one of: ${FORMATS.join(', ')}.`);
  if (!cfg.hero?.name) throw new Error('"hero.name" is required.');
  if (!Array.isArray(cfg.clips) || !cfg.clips.length)
    throw new Error('"clips" needs at least one {video, text}.');
  if (!cfg.out) throw new Error('"out" (the .mp4 to write) is required.');
  if (['cards-first', 'call-first', 'chat'].includes(cfg.format) && !cfg.hero.age)
    throw new Error(`"hero.age" is required for ${cfg.format}: his card shows it.`);
  const d = DEFAULTS[cfg.format];
  const c = {
    intro: 0,
    pip: true,
    pipSide: 'right',
    pipOffset: 0,
    timerStart: 1,
    cardsSeconds: 3.6,
    endCard: true,
    music: false,
    timing: {},
    ...structuredClone(d),
    ...cfg,
  };
  if (RING.has(c.format) || c.format === 'story') c.intro = 0;
  if (c.format === 'story') c.pip = false;
  c.out = abs(c.out);
  c.workDir = abs(cfg.workDir) || c.out.replace(/\.[^.]+$/, '') + '_work';
  c.clips = cfg.clips.map((k, i) => {
    if (!k.video || (c.format !== 'story' && !k.text))
      throw new Error(`clips[${i}] needs a video (and text for call formats).`);
    const video = abs(k.video);
    if (!fs.existsSync(video)) throw new Error(`clips[${i}].video not found: ${video}`);
    return { ...k, video };
  });
  if (c.hero.portrait) c.hero.portrait = abs(c.hero.portrait);
  if (typeof c.endCard === 'string') c.endCard = abs(c.endCard);
  if (typeof c.music === 'string') c.music = abs(c.music);
  if (Array.isArray(c.roster))
    c.roster = c.roster.map((r) =>
      typeof r === 'string' ? r : { ...r, portrait: abs(r.portrait) },
    );
  return c;
}

const bundledRoster = () => JSON.parse(fs.readFileSync(path.join(ASSETS, 'roster.json'), 'utf8'));

async function fitPortrait(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await ffmpeg([
    '-v',
    'error',
    '-i',
    src,
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-q:v',
    '3',
    dst,
  ]);
  return dst;
}

/** The ring's other cards: the bundled cast (alternating looks) or the config's own roster. */
async function rosterCards(c, pub) {
  const cast = bundledRoster();
  const byId = Object.fromEntries(cast.map((x) => [x.id, x]));
  let list = c.roster;
  if (!list) {
    const others = cast.filter((x) => x.id !== c.hero.rosterId);
    const a = others.filter((x) => x.group === 'ink'),
      b = others.filter((x) => x.group !== 'ink');
    list = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      for (const g of [a, b]) if (g[i]) list.push(g[i].id);
    list = list.slice(0, 7);
  }
  const cards = [];
  for (const [i, r] of list.entries()) {
    if (typeof r === 'string') {
      const x = byId[r];
      if (!x)
        throw new Error(`Unknown roster id "${r}". Bundled: ${cast.map((y) => y.id).join(', ')}.`);
      place(path.join(ASSETS, 'roster', `${x.id}.jpg`), path.join(pub, 'roster', `${x.id}.jpg`));
      cards.push({ id: x.id, name: x.name, age: x.age, portrait: `roster/${x.id}.jpg` });
    } else {
      if (!r.name || !r.age || !r.portrait)
        throw new Error(`roster[${i}] needs name, age and portrait.`);
      await fitPortrait(r.portrait, path.join(pub, 'roster', `custom${i}.jpg`));
      cards.push({ id: `custom${i}`, name: r.name, age: r.age, portrait: `roster/custom${i}.jpg` });
    }
  }
  return cards;
}

/** His avatar (chat): the config's portrait, his bundled cast portrait, or his first frame of the call. */
async function heroPortrait(c, pub, firstPiece) {
  const dst = path.join(pub, 'hero.jpg');
  const own = c.hero.rosterId && bundledRoster().find((x) => x.id === c.hero.rosterId);
  if (c.hero.rosterId && !own) throw new Error(`Unknown hero.rosterId "${c.hero.rosterId}".`);
  if (c.hero.portrait) await fitPortrait(c.hero.portrait, dst);
  else if (own) place(path.join(ASSETS, 'roster', `${own.id}.jpg`), dst);
  else
    await ffmpeg([
      '-v',
      'error',
      '-ss',
      firstPiece.from.toFixed(3),
      '-i',
      firstPiece.src,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      dst,
    ]);
  return 'hero.jpg';
}

function sfxEvents(c, callFrom, tapAt) {
  if (c.format === 'incoming')
    return [
      ['ring', 0.05],
      ['ring', 1.3],
      ['tap', tapAt],
      ['connect', callFrom - 0.05],
    ];
  if (c.format === 'chat')
    return [
      ...c.messages.map((m) => [m.from === 'her' ? 'sent' : 'pop', Math.max(0.05, m.at)]),
      ['ring', c.ringAt],
      ['tap', tapAt],
      ['connect', callFrom - 0.02],
    ];
  if (c.format === 'pov') return [['whoosh', c.povSeconds - 0.15]];
  if (c.format === 'mockup') return c.chips.map((x) => ['pop', x.at]);
  return [];
}

/** Everything the picture and the sound need, written to the work dir. */
async function prepare(configFile) {
  const c = load(configFile);
  const pub = path.join(c.workDir, 'public');
  fs.mkdirSync(pub, { recursive: true });
  for (const f of ['app-icon.png', 'pip-loop.mp4', 'fonts/Nunito-VariableFont_wght.ttf'])
    place(path.join(ASSETS, f), path.join(pub, f));
  const clips = [];
  for (const [k, clip] of c.clips.entries()) {
    const ext = path.extname(clip.video).toLowerCase() || '.mp4';
    place(clip.video, path.join(pub, 'clips', `clip${k}${ext}`));
    const info =
      c.format === 'story'
        ? { words: clip.words || [], measured: Boolean(clip.words), skipped: [], segments: [] }
        : await analyseClip(clip.video, clip.text, clip.words);
    info.duration = await duration(clip.video);
    clips.push({
      ...clip,
      info,
      publicPath: `clips/clip${k}${ext}`,
      origin: clip.face || c.face || { x: 540, y: 760 },
    });
  }
  const hook = c.format === 'call-first' || !c.intro;
  const call =
    c.format === 'story'
      ? planStory(clips)
      : planCall(clips, { hook, timing: c.timing, punch: c.punchZoom });
  const fi = Math.round(c.intro * FPS);
  const fc = RING.has(c.format) ? Math.round(c.cardsSeconds * FPS) : 0;
  const frames = fi + fc + call.frames;
  const total = frames / FPS;
  const callFrom = c.format === 'cards-first' ? fc / FPS : fi / FPS;
  const callTo = callFrom + call.frames / FPS;
  const tapAt = TAP_LEAD[c.format] ? (fi - TAP_LEAD[c.format]) / FPS : 0;
  const props = {
    format: c.format,
    hero: {
      id: 'hero',
      name: c.hero.name,
      age: c.hero.age ?? 0,
      portrait: await heroPortrait(c, pub, call.pieces[0]),
    },
    call: {
      video: call.pieces[0].video,
      origin: call.pieces[0].origin,
      pages: call.pages,
      pieces: call.pieces.map(({ from, to, zoom, dissolve, video, origin }) => ({
        from,
        to,
        zoom,
        dissolve,
        video,
        origin,
      })),
    },
    introSeconds: c.intro,
    tapAt: round(tapAt, 4),
    pip: c.pip,
    pipOffset: c.pipOffset,
    timerStart: c.timerStart,
    pipSide: c.pipSide,
    headline: c.headline || '',
    subline: c.subline || '',
    pov: c.povText || '',
    povSeconds: c.povSeconds || 0,
    chips: c.chips || [],
    messages: c.messages || [],
    ringAt: c.ringAt || 0,
    roster: RING.has(c.format) ? await rosterCards(c, pub) : [],
    cardsSeconds: c.cardsSeconds,
  };
  const propsFile = path.join(c.workDir, 'props.json');
  fs.writeFileSync(propsFile, JSON.stringify(props, null, 1));
  return { c, pub, clips, call, props, propsFile, frames, total, callFrom, callTo, tapAt };
}

async function build(configFile) {
  const st = await prepare(configFile);
  const { c, call, total, callFrom, callTo } = st;
  const pic = await renderPicture({
    propsFile: st.propsFile,
    publicDir: st.pub,
    frames: st.frames,
    dst: path.join(c.workDir, 'picture.mp4'),
    concurrency: c.renderConcurrency,
  });
  const w = c.workDir;
  const cutAudio = await cutCallAudio(
    call.pieces,
    path.join(w, 'cut.wav'),
    c.voiceFadeIn ??
      (c.format === 'story' ? 0 : st.callFrom > 0 || RING.has(c.format) ? 0.25 : 0.08),
    c.voiceFadeOut ?? (c.format === 'story' ? 0 : 0.6),
  );
  const voiceGain =
    c.format === 'story'
      ? (fs.copyFileSync(cutAudio, path.join(w, 'voice.wav')), 0)
      : await levelVoice(cutAudio, path.join(w, 'voice.wav'));
  let room = null;
  if (c.format === 'call-first') {
    const last = st.clips[st.clips.length - 1];
    room = {
      file: await roomTone(last.video, last.info, 1.6, voiceGain, path.join(w, 'room.wav')),
      at: callTo - 0.3,
      fade: 'afade=t=out:st=0.3:d=1.2',
    };
  } else if (callFrom > 0) {
    const first = st.clips[0];
    room = {
      file: await roomTone(first.video, first.info, 1.6, voiceGain, path.join(w, 'room.wav')),
      at: callFrom - 0.6,
      fade: 'afade=t=in:d=0.6',
    };
  }
  const events = sfxEvents(c, callFrom, st.tapAt);
  const sfx = events.length ? sfxTrack(events, total + 0.5, path.join(w, 'sfx.wav')) : null;
  const endCard =
    c.endCard === true ? path.join(ASSETS, 'endcard-continue.mp4') : c.endCard || null;
  const bundledMusic = c.music === true;
  const music = c.music
    ? {
        file: bundledMusic ? path.join(ASSETS, 'bgm_loop.flac') : c.music,
        // The bundled bed is the end card's own song: land it on the card's beat so it runs straight on.
        period: bundledMusic
          ? JSON.parse(fs.readFileSync(path.join(ASSETS, 'bgm_loop.json'), 'utf8')).period
          : 0,
        gainDb: c.musicGainDb,
      }
    : null;
  const audio = await mix({
    format: c.format,
    total,
    callFrom,
    callTo,
    voice: path.join(w, 'voice.wav'),
    room,
    sfx,
    music,
    endCard,
    workdir: w,
  });
  await mux(pic.file, endCard, audio, c.out);
  return {
    out: c.out,
    seconds: round(await duration(c.out), 2),
    loudnessLufs: round(await loudness(c.out), 1),
    format: c.format,
    sourceTiming:
      c.format === 'story' ? 'explicit ranges; action and silence retained' : 'call speech trim',
    intro: c.intro || (RING.has(c.format) ? c.cardsSeconds : 0),
    call: {
      from: round(callFrom, 2),
      seconds: round(call.frames / FPS, 2),
      pieces: call.pieces.length,
    },
    endCard: Boolean(endCard),
    // On the video's timeline, so they can be checked against frames of the output.
    captions: call.pages.map(
      (p) =>
        `${(p.start + callFrom).toFixed(2)}-${(p.end + callFrom).toFixed(2)} ${p.words.map((x) => x.text).join(' ')}`,
    ),
    timing: st.clips.map((k) => ({
      video: k.video,
      words: k.info.measured
        ? 'measured (from config)'
        : 'estimated from the audio against the known line',
      ignoredSound: k.info.skipped.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
    })),
    pipSide: c.pip ? c.pipSide : 'none',
    framesRedrawn: pic.redrawn,
    props: st.propsFile,
  };
}

async function stillsOf(configFile, seconds) {
  const st = await prepare(configFile);
  return {
    seconds: round(st.total, 2),
    callFrom: round(st.callFrom, 2),
    stills: await stills({
      propsFile: st.propsFile,
      publicDir: st.pub,
      frames: st.frames,
      seconds,
      dir: st.c.workDir,
    }),
  };
}

/** What the kit hears in a clip: speech stretches, the line placed on them, and sound it ignored. */
async function analyse(video, text) {
  const info = await analyseClip(path.resolve(video), text);
  return {
    duration: round(await duration(path.resolve(video)), 2),
    speech: info.segments.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
    words: info.words,
    ignoredSound: info.skipped.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}`),
  };
}

module.exports = { build, stillsOf, analyse, load, DEFAULTS, FORMATS };

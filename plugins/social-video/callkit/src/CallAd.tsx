import React from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  Easing,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { type Card, type Piece, pieceFrames, type Segment } from './schema';

/** Nunito, bundled with the kit (SIL OFL), so a render never depends on a font CDN. */
export const fontFamily = 'Nunito';
if (typeof window !== 'undefined' && typeof FontFace !== 'undefined') {
  const handle = delayRender('Loading Nunito');
  const face = new FontFace(
    fontFamily,
    `url('${staticFile('fonts/Nunito-VariableFont_wght.ttf')}') format('truetype')`,
    {
      weight: '200 1000',
    },
  );
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((e) => cancelRender(e));
}

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const smooth = Easing.bezier(0.16, 1, 0.3, 1);
export const BRAND = 'linear-gradient(100deg, #F9617E 0%, #5A3CFF 100%)';
const W = 1080;
const H = 1920;
/** A card on the ring is the whole frame at this scale, so the call can shrink into it with no crop. */
export const CARD_SCALE = 0.5;
export const EDGE_CROP = 1.014;
const PIP_SIZE = { w: 228, h: 342, r: 28 };
const PIP_AT = { right: { x: 1080 - 40 - 228, y: 60 }, left: { x: 44, y: 200 } } as const;

// ── The call ─────────────────────────────────────────────────────────────────────────────────

export const CallScene: React.FC<{
  seg: Segment;
  hero: Card;
  timerStart: number;
  pipStart: number;
  pipSide: 'right' | 'left';
  opening?: boolean;
  outro?: boolean;
  /** "template" puts the name alone on the first line, so an editor can retype it at any length. */
  header?: 'classic' | 'template';
}> = ({ seg, hero, timerStart, pipStart, pipSide, opening, outro, header = 'classic' }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = f / fps;
  const uiIn = opening ? 1 : interpolate(f, [0, 8], [0, 1], clamp);
  const uiOut = outro
    ? interpolate(f, [durationInFrames - 6, durationInFrames - 1], [1, 0], clamp)
    : 1;
  const ui = uiIn * uiOut;
  const push = opening ? interpolate(f, [0, 10], [1.06, 1], { ...clamp, easing: smooth }) : 1;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Pieces seg={seg} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: ui,
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 17%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.62) 100%)',
        }}
      />
      <div style={{ opacity: ui }}>
        {header === 'template' ? (
          <TemplateHeader name={hero.name} seconds={timerStart + t} />
        ) : (
          <CallHeader name={hero.name} seconds={timerStart + t} />
        )}
      </div>
      <Pip start={pipStart} side={pipSide} appear={1} opacity={ui} />
      <div style={{ opacity: ui }}>
        <Captions pages={seg.pages} t={t} />
        <CallButtons />
      </div>
    </AbsoluteFill>
  );
};

/** Frames of dissolve across each cut inside a call, half taken from either side of it. */
const DISSOLVE = 4;

export const Pieces: React.FC<{ seg: Segment }> = ({ seg }) => {
  const { fps } = useVideoConfig();
  const half = DISSOLVE / 2;
  let at = 0;
  return (
    <>
      {seg.pieces.map((pc, i) => {
        const n = pieceFrames(pc);
        const lead = i > 0 && pc.dissolve ? half : 0;
        const tail = seg.pieces[i + 1]?.dissolve ? half : 0;
        const from = at - lead;
        at += n;
        return (
          <Sequence key={i} from={from} durationInFrames={lead + n + tail} layout="none">
            <Dissolve frames={lead ? DISSOLVE : 0}>
              <SourceFrame
                seg={seg}
                piece={pc}
                source={pc.from - lead / fps}
                zoom={pc.zoom}
                fps={fps}
              />
            </Dissolve>
          </Sequence>
        );
      })}
    </>
  );
};

const Dissolve: React.FC<{ frames: number; children: React.ReactNode }> = ({
  frames,
  children,
}) => {
  const f = useCurrentFrame();
  const opacity = frames ? interpolate(f, [0, frames], [0, 1], clamp) : 1;
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/**
 * The clip from `source` seconds on. Veo bakes a ~5 px black column into both side edges of every
 * frame, so the picture is scaled just enough to push them out; a sub-pixel blur takes the edge off
 * its over-sharpened skin texture without softening the face.
 */
export const SourceFrame: React.FC<{
  seg: Segment;
  piece?: Piece;
  source: number;
  zoom: number;
  fps: number;
}> = ({ seg, piece, source, zoom, fps }) => {
  const origin = piece?.origin ?? seg.origin;
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${EDGE_CROP * zoom})`,
        transformOrigin: `${origin.x}px ${origin.y}px`,
      }}
    >
      <OffthreadVideo
        src={staticFile(piece?.video ?? seg.video)}
        trimBefore={Math.max(0, Math.round(source * fps))}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(0.35px)' }}
      />
    </AbsoluteFill>
  );
};

const CallHeader: React.FC<{ name: string; seconds: number }> = ({ name, seconds }) => {
  const s = Math.floor(seconds);
  const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div
      style={{
        position: 'absolute',
        left: 44,
        top: 70,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
      }}
    >
      <Img
        src={staticFile('app-icon.png')}
        style={{
          width: 84,
          height: 84,
          borderRadius: 22,
          boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              color: '#fff',
              fontSize: 50,
              fontWeight: 900,
              textShadow: '0 2px 10px rgba(0,0,0,0.55)',
            }}
          >
            {name}
          </span>
          <span
            style={{
              background: BRAND,
              color: '#fff',
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: 1.5,
              padding: '4px 11px',
              borderRadius: 999,
            }}
          >
            AI
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'rgba(255,255,255,0.92)',
          }}
        >
          <CameraGlyph size={30} color="#fff" />
          <span style={{ fontSize: 29, fontWeight: 800, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
            Video call · {clock}
          </span>
        </div>
      </div>
    </div>
  );
};

const clockOf = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Name alone on line one (the editor's text layer); AI badge, camera and running timer on line two. */
export const TemplateHeader: React.FC<{
  name: string;
  seconds: number;
  context?: 'call' | 'story';
}> = ({ name, seconds, context = 'call' }) => (
  <div
    style={{
      position: 'absolute',
      left: 44,
      top: 70,
      display: 'flex',
      alignItems: 'center',
      gap: 22,
    }}
  >
    <Img
      src={staticFile('app-icon.png')}
      style={{ width: 84, height: 84, borderRadius: 22, boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
    />
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 104,
        justifyContent: 'flex-end',
      }}
    >
      <span
        style={{
          color: '#fff',
          fontSize: 50,
          fontWeight: 900,
          lineHeight: 1.05,
          textShadow: '0 2px 10px rgba(0,0,0,0.55)',
        }}
      >
        {name}
      </span>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.92)' }}
      >
        <span
          style={{
            background: BRAND,
            color: '#fff',
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 1.5,
            padding: '3px 10px',
            borderRadius: 999,
          }}
        >
          AI
        </span>
        {context === 'call' ? <CameraGlyph size={30} color="#fff" /> : null}
        <span style={{ fontSize: 29, fontWeight: 800, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
          {context === 'call' ? `Video call · ${clockOf(seconds)}` : 'Character'}
        </span>
      </div>
    </div>
  </div>
);

export const Pip: React.FC<{
  start: number;
  side: 'right' | 'left';
  appear: number;
  opacity: number;
}> = ({ start, side, appear, opacity }) => {
  const { fps } = useVideoConfig();
  const at = PIP_AT[side];
  const dir = side === 'right' ? 1 : -1;
  return (
    <div
      data-pip
      style={{
        position: 'absolute',
        left: at.x,
        top: at.y,
        width: PIP_SIZE.w,
        height: PIP_SIZE.h,
        borderRadius: PIP_SIZE.r,
        overflow: 'hidden',
        border: '3px solid rgba(255,255,255,0.85)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        opacity: opacity * appear,
        transform: `translateX(${dir * (1 - appear) * 60}px) scale(${0.85 + 0.15 * appear})`,
        transformOrigin: side === 'right' ? 'top right' : 'top left',
      }}
    >
      <OffthreadVideo
        src={staticFile('pip-loop.mp4')}
        trimBefore={Math.round(start * fps)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};

export const Captions: React.FC<{ pages: Segment['pages']; t: number }> = ({ pages, t }) => {
  const page = pages.find((pg) => t >= pg.start - 0.05 && t < pg.end + 0.35);
  if (!page) return null;
  const inA = interpolate(t, [page.start - 0.05, page.start + 0.12], [0, 1], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        bottom: 1920 - 1545,
        textAlign: 'center',
        fontSize: 60,
        lineHeight: 1.18,
        textWrap: 'balance',
        fontWeight: 900,
        opacity: inA,
        transform: `translateY(${(1 - inA) * 14}px)`,
      }}
    >
      {page.words.map((w, i) => {
        const lit = t >= w.start - 0.04;
        return (
          <span
            key={i}
            style={{
              color: lit ? '#fff' : 'rgba(255,255,255,0.5)',
              textShadow: '0 3px 14px rgba(0,0,0,0.75), 0 0 3px rgba(0,0,0,0.6)',
            }}
          >
            {(i ? ' ' : '') + w.text}
          </span>
        );
      })}
    </div>
  );
};

export const CallButtons: React.FC = () => {
  const size = 176;
  const cy = 1712;
  const btn = (cx: number, bg: string, child: React.ReactNode) => (
    <div
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
      }}
    >
      {child}
    </div>
  );
  return (
    <>
      {btn(270, 'rgba(255,255,255,0.96)', <MicGlyph />)}
      {btn(540, 'rgba(255,255,255,0.96)', <CameraGlyph size={78} color="#0b0b0f" />)}
      {btn(810, '#F2352B', <EndGlyph />)}
    </>
  );
};

const MicGlyph = () => (
  <svg
    width="76"
    height="76"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#0b0b0f"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </svg>
);

export const CameraGlyph: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinejoin="round"
  >
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
  </svg>
);

const EndGlyph = () => (
  <svg
    width="70"
    height="70"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth="2.4"
    strokeLinecap="round"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const CardLabel: React.FC<{ card: Card; opacity: number; scale: number }> = ({
  card,
  opacity,
  scale,
}) => {
  const k = 1 / scale; // counter the card scale so labels read at a fixed size on screen
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '34%',
        opacity,
        background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 34 * k,
          bottom: 34 * k,
          display: 'flex',
          flexDirection: 'column',
          gap: 10 * k,
        }}
      >
        <span style={{ color: '#fff', fontSize: 46 * k, fontWeight: 900, lineHeight: 1 }}>
          {card.name}, {card.age}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8 * k,
            alignSelf: 'flex-start',
            padding: `${6 * k}px ${14 * k}px`,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            border: `${1.5 * k}px solid rgba(255,255,255,0.35)`,
            color: '#fff',
            fontSize: 24 * k,
            fontWeight: 800,
          }}
        >
          <span
            style={{ width: 12 * k, height: 12 * k, borderRadius: 99, background: '#3BE37A' }}
          />
          Video call
        </span>
      </div>
    </div>
  );
};

export const Starfield: React.FC = () => {
  const f = useCurrentFrame();
  const stars = React.useMemo(
    () =>
      Array.from({ length: 150 }, (_, i) => ({
        x: random(`x${i}`) * W,
        y: random(`y${i}`) * H,
        r: 1.2 + random(`r${i}`) ** 3 * 4.5,
        ph: random(`p${i}`) * Math.PI * 2,
        sp: 0.05 + random(`s${i}`) * 0.12,
      })),
    [],
  );
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse at 50% 45%, #1a0f3a 0%, #07050f 55%, #000 100%)',
      }}
    >
      {stars.map((s, i) => {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(f * s.sp + s.ph));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x - f * s.r * 0.35,
              top: s.y,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: 99,
              background: '#fff',
              opacity: tw,
              boxShadow: s.r > 3 ? `0 0 ${s.r * 4}px rgba(255,255,255,0.8)` : 'none',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

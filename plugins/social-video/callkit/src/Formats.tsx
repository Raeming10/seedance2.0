import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BRAND,
  CallButtons,
  CameraGlyph,
  Captions,
  clamp,
  fontFamily,
  Pieces,
  Pip,
  SourceFrame,
  Starfield,
  TemplateHeader,
} from './CallAd';
import { DIP_FRAMES, type FormatAdProps, formatTimeline } from './schema';

const W = 1080;
const H = 1920;
const ACCEPT = '#34C759';
const DECLINE = '#FF3B30';
/** "lulu" in the end card's wordmark, sampled from it. */
const LULU = '#F362DE';
const SHADE =
  'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 17%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.62) 100%)';

/** A finished video in one of the four formats; the call is the same cut the A/B templates use. */
export const FormatAd: React.FC<FormatAdProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { fi, fcall } = formatTimeline(p);
  const dip = interpolate(
    frame,
    [durationInFrames - DIP_FRAMES, durationInFrames - 1],
    [0, 1],
    clamp,
  );
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      {p.format === 'incoming' ? (
        <>
          <Sequence from={fi} durationInFrames={fcall} name="call">
            <AnsweredCall p={p} />
          </Sequence>
          <Sequence durationInFrames={fi + 8} name="ringing">
            <Ringing p={p} />
          </Sequence>
        </>
      ) : null}
      {p.format === 'chat' ? (
        <>
          <Sequence from={fi} durationInFrames={fcall} name="call">
            <AnsweredCall p={p} />
          </Sequence>
          <Sequence durationInFrames={fi + 16} name="chat">
            <Chat p={p} />
          </Sequence>
        </>
      ) : null}
      {p.format === 'pov' ? <PovCall p={p} /> : null}
      {p.format === 'mockup' ? <Mockup p={p} /> : null}
      <AbsoluteFill style={{ background: '#000', opacity: dip }} />
    </AbsoluteFill>
  );
};

// ── The call, with each part of its interface on its own dial ─────────────────────────────────

type Chrome = { ui: number; pip: number; buttons: number };

const CallLayer: React.FC<{ p: FormatAdProps; chrome: Chrome }> = ({ p, chrome }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <Pieces seg={p.call} />
      <AbsoluteFill style={{ background: SHADE }} />
      <div style={{ opacity: chrome.ui, transform: `translateY(${(1 - chrome.ui) * -40}px)` }}>
        <TemplateHeader name={p.hero.name} seconds={p.timerStart + t} />
      </div>
      {p.pip ? <Pip start={p.pipOffset} side={p.pipSide} appear={chrome.pip} opacity={1} /> : null}
      <Captions pages={p.call.pages} t={t} />
      <div
        style={{ opacity: chrome.buttons, transform: `translateY(${(1 - chrome.buttons) * 90}px)` }}
      >
        <CallButtons />
      </div>
    </AbsoluteFill>
  );
};

/** The call just picked up: the interface arrives piece by piece over its first half second. */
const AnsweredCall: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const c = useCurrentFrame();
  const ease = { ...clamp, easing: Easing.out(Easing.cubic) };
  return (
    <CallLayer
      p={p}
      chrome={{
        ui: interpolate(c, [2, 12], [0, 1], ease),
        pip: interpolate(c, [6, 18], [0, 1], ease),
        buttons: interpolate(c, [0, 10], [0, 1], ease),
      }}
    />
  );
};

/** His first frame of the call, held: what the ringing screen and the avatar show. */
const FirstLook: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const { fps } = useVideoConfig();
  const pc = p.call.pieces[0];
  return (
    <Freeze frame={0}>
      <SourceFrame seg={p.call} piece={pc} source={pc.from} zoom={pc.zoom} fps={fps} />
    </Freeze>
  );
};

const Avatar: React.FC<{ p: FormatAdProps; size: number; ring?: number }> = ({
  p,
  size,
  ring = 0,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size,
      overflow: 'hidden',
      flex: 'none',
      boxShadow: ring ? `0 0 0 ${ring}px rgba(255,255,255,0.9)` : undefined,
    }}
  >
    <Img
      src={staticFile(p.hero.portrait)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 22%' }}
    />
  </div>
);

const AiBadge: React.FC<{ size: number }> = ({ size }) => (
  <span
    style={{
      background: BRAND,
      color: '#fff',
      fontSize: size,
      fontWeight: 900,
      letterSpacing: size * 0.075,
      padding: `${size * 0.15}px ${size * 0.5}px`,
      borderRadius: 999,
      lineHeight: 1.2,
    }}
  >
    AI
  </span>
);

/** Rings expanding off a button that wants to be pressed. */
const Pulse: React.FC<{ size: number; color: string; stop: number }> = ({ size, color, stop }) => {
  const f = useCurrentFrame();
  if (f >= stop) return null;
  return (
    <>
      {[0, 1, 2].map((k) => {
        const ph = ((f + k * 12) % 36) / 36;
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: size,
              border: `${size * 0.03}px solid ${color}`,
              transform: `scale(${1 + ph * 0.8})`,
              opacity: 0.6 * (1 - ph),
            }}
          />
        );
      })}
    </>
  );
};

/** Her fingertip: a soft disc that lands and spreads. */
const Touch: React.FC<{ x: number; y: number; at: number; size: number }> = ({
  x,
  y,
  at,
  size,
}) => {
  const f = useCurrentFrame();
  const k = interpolate(f, [at - 3, at + 10], [0, 1], clamp);
  if (k <= 0 || k >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        background: 'rgba(255,255,255,0.55)',
        border: '3px solid rgba(255,255,255,0.9)',
        transform: `scale(${0.55 + 0.75 * k})`,
        opacity: k < 0.25 ? k * 4 : 1 - (k - 0.25) / 0.75,
      }}
    />
  );
};

/** The accept button's squeeze under her finger. */
const press = (f: number, at: number) =>
  interpolate(f, [at - 2, at + 2, at + 6, at + 10], [1, 0.84, 1.06, 1], clamp);

const PhoneDownGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
    <path d="M12 8.5c-3.6 0-7 1.2-9.3 3.3-.5.5-.5 1.2 0 1.7l1.9 1.9c.4.4 1.1.5 1.6.1l2.2-1.6c.3-.2.5-.6.5-1v-2.1c1-.3 2-.4 3.1-.4s2.1.1 3.1.4v2.1c0 .4.2.8.5 1l2.2 1.6c.5.4 1.2.3 1.6-.1l1.9-1.9c.5-.5.5-1.2 0-1.7C19 9.7 15.6 8.5 12 8.5z" />
  </svg>
);

// ── C · incoming: his video call rings, she answers ──────────────────────────────────────────

const Ringing: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fi } = formatTimeline(p);
  const tap = Math.round(p.tapAt * fps);
  // 0 while it rings, 1 once the call is on: the blur lifts off his face as the ringing screen leaves.
  const out = interpolate(f, [tap + 3, fi + 6], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const gone = interpolate(f, [fi, fi + 7], [1, 0], clamp);
  const drift = interpolate(f, [0, fi], [1.07, 1.0], clamp) + 0.06 * (1 - out);
  const headIn = spring({ frame: f + 6, fps, config: { damping: 16, mass: 0.7 } });
  const dots = '.'.repeat(Math.floor(f / 8) % 4);
  const btnY = 1560;
  const size = 176;
  const accept = { x: 810, y: btnY };
  const wiggle = f < tap - 3 ? 1 + 0.045 * Math.max(0, Math.sin((f / fps) * Math.PI * 2.4)) : 1;
  return (
    <AbsoluteFill style={{ opacity: gone }}>
      <AbsoluteFill style={{ transform: `scale(${drift})`, filter: `blur(${16 * (1 - out)}px)` }}>
        <FirstLook p={p} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(to bottom, rgba(14,8,34,${0.72 * (1 - out)}) 0%, rgba(14,8,34,${0.35 * (1 - out)}) 45%, rgba(8,4,20,${0.8 * (1 - out)}) 100%)`,
        }}
      />
      <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 + 0.06 * out})` }}>
        <div
          style={{
            position: 'absolute',
            top: 150,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Img
              src={staticFile('app-icon.png')}
              style={{ width: 64, height: 64, borderRadius: 16 }}
            />
            <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 36, fontWeight: 800 }}>
              Prelulu video call
            </span>
          </div>
          <div
            style={{
              marginTop: 40,
              color: '#fff',
              fontSize: 138,
              fontWeight: 900,
              lineHeight: 1,
              textShadow: '0 6px 30px rgba(0,0,0,0.5)',
            }}
          >
            {p.hero.name}
          </div>
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 16 }}>
            <AiBadge size={30} />
            <span style={{ color: '#fff', fontSize: 44, fontWeight: 800, width: 360 }}>
              is calling you{dots}
            </span>
          </div>
        </div>
        {p.headline ? (
          <div
            style={{
              position: 'absolute',
              left: 80,
              right: 80,
              top: 1150,
              textAlign: 'center',
              color: '#fff',
              fontSize: 74,
              fontWeight: 900,
              lineHeight: 1.1,
              textWrap: 'balance',
              textShadow: '0 4px 24px rgba(0,0,0,0.8)',
              opacity: Math.min(1, headIn * 1.5),
              transform: `translateY(${(1 - headIn) * 30}px)`,
            }}
          >
            {p.headline}
          </div>
        ) : null}
        {(
          [
            {
              x: 270,
              bg: DECLINE,
              label: 'Decline',
              glyph: <PhoneDownGlyph size={92} />,
              live: false,
            },
            {
              x: accept.x,
              bg: ACCEPT,
              label: 'Accept',
              glyph: <CameraGlyph size={84} color="#fff" />,
              live: true,
            },
          ] as const
        ).map((b) => (
          <div
            key={b.label}
            style={{
              position: 'absolute',
              left: b.x - size / 2,
              top: btnY - size / 2,
              width: size,
            }}
          >
            <div style={{ position: 'relative', width: size, height: size }}>
              {b.live ? <Pulse size={size} color={ACCEPT} stop={tap} /> : null}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: size,
                  background: b.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                  transform: `scale(${b.live ? wiggle * press(f, tap) : 1})`,
                }}
              >
                {b.glyph}
              </div>
            </div>
            <div
              style={{
                marginTop: 18,
                textAlign: 'center',
                color: '#fff',
                fontSize: 34,
                fontWeight: 800,
              }}
            >
              {b.label}
            </div>
          </div>
        ))}
      </AbsoluteFill>
      <Touch x={accept.x} y={accept.y} at={tap} size={150} />
    </AbsoluteFill>
  );
};

// ── D · chat: a late-night chat in the app turns into his video call ──────────────────────────

const Bubble: React.FC<{ from: 'her' | 'him'; at: number; children: React.ReactNode }> = ({
  from,
  at,
  children,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = at <= 0 ? 1 : spring({ frame: f - at, fps, config: { damping: 14, mass: 0.55 } });
  const her = from === 'her';
  return (
    <div style={{ display: 'flex', justifyContent: her ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: 800,
          padding: '28px 40px',
          borderRadius: 46,
          borderBottomRightRadius: her ? 12 : 46,
          borderBottomLeftRadius: her ? 46 : 12,
          background: her ? BRAND : '#2B2442',
          color: '#fff',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 1.22,
          opacity: Math.min(1, k * 2),
          transform: `scale(${0.7 + 0.3 * k})`,
          transformOrigin: her ? '100% 100%' : '0% 100%',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Typing: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 4px' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 18,
            height: 18,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.8)',
            transform: `translateY(${-8 * Math.max(0, Math.sin((f - i * 4) / 4))}px)`,
          }}
        />
      ))}
    </div>
  );
};

const Chat: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { fi } = formatTimeline(p);
  const t = f / fps;
  const tap = Math.round(p.tapAt * fps);
  const ring = Math.round(p.ringAt * fps);
  const TYPE = 0.75; // seconds of "typing…" before each of his messages
  const bannerIn = spring({ frame: f - ring, fps, config: { damping: 15, mass: 0.8 } });
  const accept = { x: W - 40 - 34 - 58, y: 60 + 100 };
  // The call opens through a hole that grows out of the accept button.
  const hole = interpolate(f, [fi - 2, fi + 14], [0, 2300], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });
  const mask =
    hole > 0
      ? `radial-gradient(circle at ${accept.x}px ${accept.y}px, transparent ${hole}px, #000 ${hole + 2}px)`
      : undefined;
  const camGlow = f >= ring ? 0.5 + 0.5 * Math.sin(f / 3) : 0;
  return (
    <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>
      <AbsoluteFill style={{ background: '#0B0816' }}>
        <AbsoluteFill style={{ opacity: 0.45 }}>
          <Starfield />
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(to bottom, rgba(11,8,22,0) 0%, rgba(11,8,22,0.55) 60%, #0B0816 100%)',
          }}
        />
      </AbsoluteFill>
      {/* header */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 250,
          background: 'rgba(20,15,36,0.92)',
          borderBottom: '2px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 36,
            top: 104,
            display: 'flex',
            alignItems: 'center',
            gap: 26,
          }}
        >
          <svg
            width="40"
            height="60"
            viewBox="0 0 12 20"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M10 2 2 10l8 8" />
          </svg>
          <Avatar p={p} size={120} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ color: '#fff', fontSize: 52, fontWeight: 900, lineHeight: 1 }}>
                {p.hero.name}
              </span>
              <AiBadge size={24} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 16, height: 16, borderRadius: 16, background: '#3BE37A' }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 32, fontWeight: 700 }}>
                Online
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 40,
            top: 116,
            width: 104,
            height: 104,
            borderRadius: 104,
            background: BRAND,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 ${40 * camGlow}px rgba(249,97,126,${0.9 * camGlow})`,
          }}
        >
          <CameraGlyph size={56} color="#fff" />
        </div>
      </div>
      {/* thread */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: 310,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            marginBottom: 18,
          }}
        >
          <Avatar p={p} size={300} ring={5} />
          <div
            style={{ marginTop: 14, color: '#fff', fontSize: 60, fontWeight: 900, lineHeight: 1 }}
          >
            {p.hero.name}, {p.hero.age}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 32, fontWeight: 800 }}>
            AI companion · video calls
          </div>
          <div
            style={{
              marginTop: 26,
              color: 'rgba(255,255,255,0.45)',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            Today 11:47 PM
          </div>
        </div>
        {p.messages.map((m, i) => {
          const at = Math.round(m.at * fps);
          if (m.from === 'him' && t >= m.at - TYPE && t < m.at) {
            return (
              <Bubble key={i} from="him" at={Math.round((m.at - TYPE) * fps)}>
                <Typing />
              </Bubble>
            );
          }
          if (f < at) return null;
          return (
            <Bubble key={i} from={m.from} at={at}>
              {m.text}
            </Bubble>
          );
        })}
      </div>
      {/* composer */}
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          bottom: 90,
          height: 124,
          borderRadius: 124,
          background: 'rgba(255,255,255,0.08)',
          border: '2px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 44px',
          color: 'rgba(255,255,255,0.45)',
          fontSize: 40,
          fontWeight: 700,
        }}
      >
        Message {p.hero.name}…
      </div>
      {/* his call drops in over the thread */}
      {f >= ring ? (
        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            top: 60,
            height: 200,
            borderRadius: 50,
            background: 'rgba(34,27,58,0.97)',
            border: '2px solid rgba(255,255,255,0.14)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            transform: `translateY(${(1 - bannerIn) * -300}px)`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 34px',
            gap: 26,
          }}
        >
          <Avatar p={p} size={128} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#fff', fontSize: 50, fontWeight: 900, lineHeight: 1 }}>
                {p.hero.name}
              </span>
              <AiBadge size={22} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 34, fontWeight: 700 }}>
              Incoming video call…
            </span>
          </div>
          <div
            style={{
              width: 116,
              height: 116,
              borderRadius: 116,
              background: DECLINE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PhoneDownGlyph size={64} />
          </div>
          <div style={{ position: 'relative', width: 116, height: 116 }}>
            <Pulse size={116} color={ACCEPT} stop={tap} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 116,
                background: ACCEPT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${press(f, tap)})`,
              }}
            >
              <CameraGlyph size={60} color="#fff" />
            </div>
          </div>
        </div>
      ) : null}
      <Touch x={accept.x} y={accept.y} at={tap} size={110} />
    </AbsoluteFill>
  );
};

// ── E · pov: native POV text over his face; the call interface arrives after ─────────────────

const PovCall: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = Math.round(p.povSeconds * fps);
  const ease = { ...clamp, easing: Easing.out(Easing.cubic) };
  const box = interpolate(f, [end - 6, end + 2], [1, 0], clamp);
  return (
    <AbsoluteFill>
      <CallLayer
        p={p}
        chrome={{
          ui: interpolate(f, [end, end + 10], [0, 1], ease),
          pip: interpolate(f, [end + 4, end + 16], [0, 1], ease),
          buttons: interpolate(f, [end + 2, end + 12], [0, 1], ease),
        }}
      />
      <PovTitle text={p.pov} box={box} />
    </AbsoluteFill>
  );
};

/** Shared POV title. Story and call formats use the same markup, typography and animation. */
export const PovTitle: React.FC<{ text: string; box: number }> = ({ text, box }) => {
  return box > 0 ? (
    <div
      style={{
        position: 'absolute',
        left: 64,
        right: 64,
        top: 150,
        textAlign: 'center',
        opacity: box,
        transform: `scale(${0.94 + 0.06 * box})`,
      }}
    >
      <span
        style={{
          background: '#fff',
          color: '#121212',
          fontSize: 56,
          fontWeight: 800,
          lineHeight: 1.45,
          padding: '6px 20px',
          borderRadius: 16,
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {text}
      </span>
    </div>
  ) : null;
};

// ── F · mockup: the call inside a phone on the brand sky, callouts popping around it ───────────

const PHONE_S = 0.62;
const PHONE = { w: W * PHONE_S, h: H * PHONE_S, top: 420, bezel: 16 };

const Mockup: React.FC<{ p: FormatAdProps }> = ({ p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inK = spring({ frame: f, fps, config: { damping: 18, mass: 0.8 } });
  const left = (W - PHONE.w) / 2;
  const spots = [
    // Clear of her camera (top right of the screen) and of his captions (the band above the buttons).
    { side: 'left', y: 720, tilt: -4 },
    { side: 'right', y: 950, tilt: 3 },
    { side: 'left', y: 1160, tilt: -2 },
  ] as const;
  return (
    <AbsoluteFill>
      <Starfield />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 50% 58%, rgba(90,60,255,0.35) 0%, rgba(0,0,0,0) 60%)',
        }}
      />
      <div style={{ position: 'absolute', left: 60, right: 60, top: 96, textAlign: 'center' }}>
        <div
          style={{
            color: '#fff',
            fontSize: 82,
            fontWeight: 900,
            lineHeight: 1.06,
            textWrap: 'balance',
            textShadow: '0 4px 24px rgba(0,0,0,0.7)',
          }}
        >
          {p.headline}
        </div>
        {p.subline ? (
          <div
            style={{
              display: 'inline-block',
              marginTop: 22,
              padding: '12px 30px',
              borderRadius: 999,
              background: BRAND,
              color: '#fff',
              fontSize: 38,
              fontWeight: 900,
            }}
          >
            {p.subline}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          left: left - PHONE.bezel,
          top: PHONE.top - PHONE.bezel,
          width: PHONE.w + 2 * PHONE.bezel,
          height: PHONE.h + 2 * PHONE.bezel,
          borderRadius: 96,
          background: '#0c0b12',
          border: '3px solid rgba(255,255,255,0.22)',
          boxShadow: '0 40px 140px rgba(90,60,255,0.45), 0 20px 60px rgba(0,0,0,0.7)',
          transform: `translateY(${(1 - inK) * 60}px) scale(${1.04 - 0.04 * inK})`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: PHONE.bezel - 3,
            top: PHONE.bezel - 3,
            width: PHONE.w,
            height: PHONE.h,
            borderRadius: 80,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: W,
              height: H,
              transform: `scale(${PHONE_S})`,
              transformOrigin: '0 0',
              position: 'relative',
            }}
          >
            <CallLayer p={p} chrome={{ ui: 1, pip: 1, buttons: 1 }} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: PHONE.w / 2 - 90,
              top: 20,
              width: 180,
              height: 50,
              borderRadius: 50,
              background: '#000',
            }}
          />
        </div>
      </div>
      {p.chips.map((c, i) => {
        const spot = spots[i % spots.length];
        const k = spring({
          frame: f - Math.round(c.at * fps),
          fps,
          config: { damping: 11, mass: 0.6 },
        });
        if (f < Math.round(c.at * fps)) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: spot.y,
              [spot.side]: 36,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '20px 34px 20px 24px',
              borderRadius: 999,
              background: '#fff',
              color: '#1a1030',
              fontSize: 40,
              fontWeight: 900,
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              transform: `rotate(${spot.tilt}deg) scale(${k})`,
              transformOrigin: spot.side === 'left' ? '0% 50%' : '100% 50%',
            }}
          >
            <span
              style={{ width: 22, height: 22, borderRadius: 22, background: BRAND, flex: 'none' }}
            />
            {c.text}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: PHONE.top + PHONE.h + PHONE.bezel + 70,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 22,
        }}
      >
        <Img src={staticFile('app-icon.png')} style={{ width: 96, height: 96, borderRadius: 24 }} />
        <span style={{ fontSize: 76, fontWeight: 900, lineHeight: 1 }}>
          <span style={{ color: '#fff' }}>Pre</span>
          <span style={{ color: LULU }}>lulu</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};

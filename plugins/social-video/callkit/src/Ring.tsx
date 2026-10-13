import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  BRAND,
  CallScene,
  CARD_SCALE,
  CardLabel,
  clamp,
  fontFamily,
  SourceFrame,
  Starfield,
} from './CallAd';
import {
  type Card,
  DIP_FRAMES,
  type Segment,
  type TemplateAdProps,
  templateTimeline,
} from './schema';

const W = 1080;
const H = 1920;
/** Chroma-key green for the editor reels: the editor keys it out and the call shows through. */
const KEY_GREEN = '#00FF00';

type HeroFill = { kind: 'video'; seg: Segment; at: 'first' | 'last' } | { kind: 'green' };

/**
 * The card ring, either opening the video and landing on his card ("land"), or taking over when the call
 * shrinks into his card ("launch"). His card is the call itself: a frozen frame of it, or a green window
 * in the editor reels.
 */
export const Ring: React.FC<{
  mode: 'land' | 'launch';
  hero: Card | null;
  fill: HeroFill;
  roster: Card[];
  headline: string;
  subline: string;
}> = ({ mode, hero, fill, roster, headline, subline }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: fc } = useVideoConfig();
  const Z = Math.round(0.5 * fps);
  const cards: (Card | null)[] = [hero, ...roster];
  const n = cards.length;
  const step = 360 / n;
  // zoom: 0 = his card fills the screen, 1 = every card sits on the ring. Snap in and out quickly: a
  // card lingering near full size shows its border.
  const zoom =
    mode === 'land'
      ? 1 - interpolate(f, [fc - Z, fc - 2], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) })
      : interpolate(f, [1, Z], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  // Landing: his card starts at the back and arrives at the front after a turn and a half.
  // Launching: it leaves the front and the ring turns on.
  const spin =
    mode === 'land'
      ? interpolate(f, [0, fc - Z], [180, 720], { ...clamp, easing: Easing.inOut(Easing.sin) })
      : interpolate(f, [Math.round(Z * 0.6), fc], [0, 420], {
          ...clamp,
          easing: Easing.inOut(Easing.sin),
        });
  const R = 1000;
  const textIn =
    mode === 'land'
      ? interpolate(f, [0, 8, fc - Z - 8, fc - Z + 2], [0, 1, 1, 0], clamp)
      : interpolate(f, [Z - 4, Z + 8], [0, 1], clamp);
  const green = fill.kind === 'green';

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      <AbsoluteFill style={{ opacity: zoom }}>
        <Starfield />
        <Img
          src={staticFile('app-icon.png')}
          style={{
            position: 'absolute',
            left: 60,
            top: 70,
            width: 110,
            height: 110,
            borderRadius: 26,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: '50% 50%' }}>
        {cards.map((c, i) => {
          const isHero = i === 0;
          // In the editor reels his slot is a green window that exists only while it is the call: it flips
          // in at the front just before the landing, or flips away right after the launch. A flip (not a
          // fade) keeps the green pure, so it keys cleanly.
          const flip = !(isHero && green)
            ? 0
            : mode === 'land'
              ? interpolate(f, [fc - Z - 14, fc - Z - 5], [-90, 0], clamp)
              : interpolate(f, [Z, Z + 6], [0, 90], clamp);
          const angle = ((((i * step - spin) % 360) + 540) % 360) - 180;
          if (Math.abs(angle) > 95) return null;
          if (isHero && green && Math.abs(flip) >= 89.9) return null;
          if (!isHero && zoom <= 0) return null;
          const rad = (angle * Math.PI) / 180;
          const x = Math.sin(rad) * R * zoom;
          const z = (Math.cos(rad) - 1) * R * zoom;
          const scale = isHero ? 1 - (1 - CARD_SCALE) * zoom : CARD_SCALE;
          const shade = interpolate(Math.abs(angle), [0, 90], [0, 0.55], clamp);
          const radius = interpolate(scale, [CARD_SCALE, 1], [44 / CARD_SCALE, 0]);
          const labelIn = isHero ? interpolate(zoom, [0.75, 1], [0, 1], clamp) : 1;
          return (
            <div
              key={c?.id ?? 'hero'}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: W,
                height: H,
                transform: `translate3d(${x}px, 0px, ${z}px) rotateY(${angle * zoom + flip}deg) scale(${scale})`,
                zIndex: Math.round(1000 + z),
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: radius,
                  overflow: 'hidden',
                  boxShadow:
                    zoom > 0.15 && !(isHero && green)
                      ? `0 ${40 / scale}px ${90 / scale}px rgba(0,0,0,${0.6 * zoom})`
                      : 'none',
                  border:
                    zoom > 0.15 && !(isHero && green)
                      ? `${3 / scale}px solid rgba(255,255,255,${0.35 * zoom})`
                      : 'none',
                  background: isHero && green ? KEY_GREEN : undefined,
                }}
              >
                {isHero ? (
                  fill.kind === 'video' ? (
                    <HeroFrame fill={fill} />
                  ) : null
                ) : c ? (
                  <Img
                    src={staticFile(c.portrait)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : null}
                {c && !(isHero && green) ? (
                  <CardLabel card={c} opacity={labelIn} scale={scale} />
                ) : null}
                {shade > 0 && !(isHero && green) ? (
                  <AbsoluteFill
                    style={{ background: `rgba(0,0,0,${shade * (isHero ? zoom : 1)})` }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 1500,
          textAlign: 'center',
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 24}px)`,
        }}
      >
        <div
          style={{
            color: '#fff',
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 1.08,
            textShadow: '0 4px 24px rgba(0,0,0,0.8)',
          }}
        >
          {headline}
        </div>
        {subline ? (
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
            {subline}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const HeroFrame: React.FC<{ fill: Extract<HeroFill, { kind: 'video' }> }> = ({ fill }) => {
  const { fps } = useVideoConfig();
  const pieces = fill.seg.pieces;
  const pc = fill.at === 'first' ? pieces[0] : pieces[pieces.length - 1];
  return (
    <Freeze frame={0}>
      <SourceFrame
        seg={fill.seg}
        piece={pc}
        source={fill.at === 'first' ? pc.from : pc.to - 1 / fps}
        zoom={pc.zoom}
        fps={fps}
      />
    </Freeze>
  );
};

/** A finished video in either ring order; the ring is never inside the call. */
export const TemplateAd: React.FC<TemplateAdProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { fcall, fc } = templateTimeline(p);
  const dip = interpolate(
    frame,
    [durationInFrames - DIP_FRAMES, durationInFrames - 1],
    [0, 1],
    clamp,
  );
  const cardsFirst = p.order === 'cards-first';
  const callFrom = cardsFirst ? fc : 0;
  const cardsFrom = cardsFirst ? 0 : fcall;
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      <Sequence from={cardsFrom} durationInFrames={fc} name="cards">
        <Ring
          mode={cardsFirst ? 'land' : 'launch'}
          hero={p.hero}
          fill={{ kind: 'video', seg: p.call, at: cardsFirst ? 'first' : 'last' }}
          roster={p.roster}
          headline={p.headline}
          subline={p.subline}
        />
      </Sequence>
      <Sequence from={callFrom} durationInFrames={fcall} name="call">
        <CallScene
          seg={p.call}
          hero={p.hero}
          timerStart={p.timerStart}
          pipStart={p.pipOffset}
          pipSide={p.pipSide}
          opening={!cardsFirst}
          outro={!cardsFirst}
          header="template"
        />
      </Sequence>
      <AbsoluteFill style={{ background: '#000', opacity: dip }} />
    </AbsoluteFill>
  );
};

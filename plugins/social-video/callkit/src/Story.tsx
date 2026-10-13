import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, clamp, fontFamily, Pieces, TemplateHeader } from './CallAd';
import { PovTitle } from './Formats';
import { type AdProps } from './schema';

/** Cinematic footage with existing kit components. No call premise or generated overlay artwork. */
export const Story: React.FC<{ p: AdProps }> = ({ p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const end = Math.round(p.povSeconds * fps);
  const box = p.pov ? interpolate(frame, [Math.max(0, end - 6), end + 2], [1, 0], clamp) : 0;
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily }}>
      <Pieces seg={p.call} />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.25), transparent 22%, transparent 66%, rgba(0,0,0,0.25))',
        }}
      />
      <div style={{ opacity: 1 - box }}>
        <TemplateHeader name={p.hero.name} seconds={0} context="story" />
      </div>
      <PovTitle text={p.pov} box={box} />
      <Captions pages={p.call.pages} t={frame / fps} />
    </AbsoluteFill>
  );
};

import React from 'react';
import { Composition } from 'remotion';
import { PreluluCall } from './Call';
import { adSchema, adTimeline, FPS } from './schema';

export const Root: React.FC = () => (
  <Composition
    id="PreluluCall"
    component={PreluluCall}
    schema={adSchema}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={300}
    calculateMetadata={({ props }) => ({
      durationInFrames: adTimeline(props).total,
      props: adSchema.parse(props),
    })}
    defaultProps={{
      format: 'story' as const,
      hero: { id: 'hero', name: 'Marcus', age: 38, portrait: 'roster/marcus.jpg' },
      call: {
        video: 'clips/clip0.mp4',
        pieces: [{ from: 0.2, to: 6, zoom: 1, dissolve: false }],
        origin: { x: 540, y: 760 },
        pages: [],
      },
      introSeconds: 0,
      tapAt: 0,
      pip: false,
      pipOffset: 0,
      timerStart: 1,
      pipSide: 'right' as const,
      headline: '',
      subline: '',
      pov: '',
      povSeconds: 3,
      chips: [],
      messages: [],
      ringAt: 0,
      roster: [],
      cardsSeconds: 3.6,
    }}
  />
);

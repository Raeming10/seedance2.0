import React from 'react';
import { FormatAd } from './Formats';
import { type AdProps, isRing } from './schema';
import { TemplateAd } from './Ring';
import { Story } from './Story';

/** The video in whichever format the props name. */
export const PreluluCall: React.FC<AdProps> = (p) =>
  p.format === 'story' ? (
    <Story p={p} />
  ) : isRing(p.format) ? (
    <TemplateAd {...p} order={p.format} />
  ) : (
    <FormatAd {...p} format={p.format as 'incoming' | 'chat' | 'pov' | 'mockup'} />
  );

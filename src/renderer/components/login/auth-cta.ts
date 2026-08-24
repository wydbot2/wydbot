import { type CSSProperties } from 'react';

/** Primary-CTA geometry shared by the auth screens (gate + login). */
export const CTA_CLASS = 'gap-[9px] rounded-[10px] px-4 py-[11px]';

/** Inset highlight + accent glow for the primary CTA. */
export const CTA_SHADOW: CSSProperties = {
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 20px -10px rgba(37,99,235,0.9)',
};

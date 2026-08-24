import { type CSSProperties, type FC, type ReactNode } from 'react';
import { Logo } from '../shared/Logo';

interface GateShellProps {
  /** Card inner content. */
  children: ReactNode;
  /** Status footer strip rendered inside the card. */
  footer?: ReactNode;
  /** Center the card inner content (gate states). */
  centered?: boolean;
}

const FIELD_STYLE: CSSProperties = {
  background:
    'radial-gradient(110% 80% at 50% 22%, rgba(37,99,235,0.055), transparent 60%),' +
    'radial-gradient(140% 120% at 50% 120%, rgba(0,0,0,0.5), transparent 55%),' +
    'var(--color-field)',
};

const CARD_GLOW_STYLE: CSSProperties = {
  width: 360,
  height: 240,
  left: '50%',
  top: '46%',
  transform: 'translate(-50%,-50%)',
  background: 'radial-gradient(50% 50% at 50% 50%, rgba(37,99,235,0.12), transparent 70%)',
};

const LOGO_GLOW_STYLE: CSSProperties = {
  inset: '-30px -20px',
  background: 'radial-gradient(50% 120% at 50% 40%, rgba(59,130,246,0.1), transparent 70%)',
};

const CARD_STYLE: CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.018), transparent 40%), var(--color-gray-900)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 24px 50px -24px rgba(0,0,0,0.7)',
};

/** Full-screen radial field + glowing logo + glass auth card. Shared by gate + login. */
export const GateShell: FC<GateShellProps> = ({ children, footer, centered = false }) => (
  <div
    className="relative flex min-h-screen justify-center overflow-y-auto bg-field px-8 py-10 select-none"
    style={FIELD_STYLE}
  >
    <div className="relative my-auto flex flex-col items-center">
      <div aria-hidden className="pointer-events-none absolute z-0" style={CARD_GLOW_STYLE} />
      <div className="relative mb-[22px]">
        <span aria-hidden className="pointer-events-none absolute -z-10" style={LOGO_GLOW_STYLE} />
        <Logo className="h-auto w-[132px]" />
      </div>
      <div
        className="relative z-[1] w-[404px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-800"
        style={CARD_STYLE}
      >
        <div
          className={`relative z-[1] flex flex-col gap-[13px] px-[22px] pt-[22px] pb-[18px] ${centered ? 'items-center text-center' : ''}`}
        >
          {children}
        </div>
        {footer}
      </div>
    </div>
  </div>
);

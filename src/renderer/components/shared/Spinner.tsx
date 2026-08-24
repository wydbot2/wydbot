import { type FC } from 'react';

interface SpinnerProps {
  /** Diameter in px. Defaults to the in-button size. */
  size?: number;
  className?: string;
}

/** Ring spinner. White-on-transparent by default; override ring tone via className. */
export const Spinner: FC<SpinnerProps> = ({ size = 15, className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block flex-shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white ${className}`}
    style={{ width: size, height: size }}
  />
);

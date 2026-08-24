import { type FC } from 'react';

interface IconProps {
  width?: number;
  height?: number;
  className?: string;
}

/** Triangle warning glyph (same path as SplashScreen's WarnIcon). */
export const WarnIcon: FC<IconProps> = ({ width = 20, height = 20, className }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
    />
  </svg>
);

/** Wi-Fi with a slash (offline). */
export const WifiOffIcon: FC<IconProps> = ({ width = 20, height = 20, className }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l2.49 2.49C3.5 6.5 2.42 7.4 1.5 8.46a.75.75 0 1 0 1.13.98 11.6 11.6 0 0 1 3.2-2.6l1.6 1.6a8.1 8.1 0 0 0-2.95 2.05.75.75 0 0 0 1.1 1.02 6.6 6.6 0 0 1 3.04-1.86l1.74 1.74a3.9 3.9 0 0 0-2.86 1.36.75.75 0 0 0 1.13.98 2.4 2.4 0 0 1 3.36-.3l3.04 3.05a.75.75 0 0 0 1.06-1.06L3.28 2.22zM10 3.5c2.86 0 5.56 1.05 7.64 2.96a.75.75 0 0 0 1.01-1.1A12.95 12.95 0 0 0 10 2c-.74 0-1.47.06-2.18.18l1.3 1.3c.29-.02.58-.03.88-.03zm3.2 5.05 1.16 1.16a8.16 8.16 0 0 1 1.01.77.75.75 0 0 0 1.1-1.02 9.6 9.6 0 0 0-3.27-2.13l.6.6c-.2.2-.4.42-.6.62zM10 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
  </svg>
);

/** Desktop / computer glyph. */
export const DeviceIcon: FC<IconProps> = ({ width = 20, height = 20, className }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 4a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 3 14h4.25l-.4 2H6a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5h-.85l-.4-2H17a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 17 4H3zm0 1.5h14v7H3v-7z"
    />
  </svg>
);

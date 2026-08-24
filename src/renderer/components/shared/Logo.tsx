import { type FC } from 'react';
import logoUrl from '@renderer/assets/wydbot-logo-white.svg';

interface LogoProps {
  /** Tailwind sizing/positioning. Defaults to the compact splash-header size. */
  className?: string;
}

/**
 * Brand wordmark. Uses the white variant for our dark surfaces and is served as
 * a single hashed asset by Vite (cached + deduped across every usage).
 */
export const Logo: FC<LogoProps> = ({ className = 'h-5 w-auto' }) => (
  <img src={logoUrl} alt="wydbot" className={className} draggable={false} />
);

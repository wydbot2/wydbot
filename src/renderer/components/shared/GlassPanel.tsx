import type { FC, ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
}

/** Semi-transparent glass-effect container with blur and shadow. */
export const GlassPanel: FC<GlassPanelProps> = ({ children, className }) => (
  <div className={`bg-gray-900/80 shadow-md backdrop-blur-sm ${className ?? ''}`}>{children}</div>
);

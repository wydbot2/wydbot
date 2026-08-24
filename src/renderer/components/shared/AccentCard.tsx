import { type FC, type ReactNode, type CSSProperties } from 'react';

type AccentCardVariant = 'card' | 'bar';

export interface AccentCardProps {
  variant?: AccentCardVariant;
  accent: string;
  accentWidth?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const variantStyles: Record<AccentCardVariant, string> = {
  card: 'flex flex-col overflow-hidden rounded-lg border border-gray-700/60 bg-gray-900/60 px-3 py-2.5',
  bar: 'flex h-9 items-center overflow-hidden rounded-md border border-gray-700 bg-gray-800/40 pr-1.5',
};

export const AccentCard: FC<AccentCardProps> = ({
  variant = 'card',
  accent,
  accentWidth = 3,
  className = '',
  style,
  children,
}) => {
  const stripColor = variant === 'card' ? `color-mix(in srgb, ${accent} 80%, transparent)` : accent;
  return (
    <div
      className={`${variantStyles[variant]} ${className}`}
      style={{
        borderLeft: `${accentWidth}px solid ${stripColor}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

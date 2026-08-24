import { type FC, type ReactNode } from 'react';
import { PlayIcon, PauseIcon } from '@heroicons/react/20/solid';
import { Button } from '../shared/Button';

export type TransportMode = 'play' | 'pause' | 'resume';

interface TransportButtonProps {
  mode: TransportMode;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export const TransportButton: FC<TransportButtonProps> = ({
  mode,
  onClick,
  disabled,
  children,
  className = '',
}) => {
  const variant = mode === 'pause' ? 'warning' : 'primary';
  const Icon = mode === 'pause' ? PauseIcon : PlayIcon;

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[5.5rem] ${className}`}
    >
      <span
        key={mode}
        className="inline-flex animate-transport-swap items-center gap-1.5 motion-reduce:animate-none"
      >
        <Icon className="h-4 w-4" />
        <span>{children}</span>
      </span>
    </Button>
  );
};

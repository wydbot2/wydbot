import { LockClosedIcon } from '@heroicons/react/20/solid';
import type { FC, ReactNode } from 'react';

interface PageTabsProps {
  count: number;
  active: number;
  onSelect: (index: number) => void;
  renderLabel: (index: number) => ReactNode;
  isLocked?: (index: number) => boolean;
}

export const PageTabs: FC<PageTabsProps> = ({ count, active, onSelect, renderLabel, isLocked }) => (
  <div className="flex gap-0.5 rounded-md border border-gray-700/60 bg-gray-900/70 p-[3px]">
    {Array.from({ length: count }, (_, i) => {
      const locked = isLocked?.(i) ?? false;
      const isActive = active === i;
      return (
        <button
          key={i}
          type="button"
          aria-pressed={isActive}
          onClick={() => onSelect(i)}
          className={`flex flex-1 items-center justify-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors ${
            isActive ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          } ${locked ? 'opacity-60' : ''}`}
        >
          {renderLabel(i)}
          {locked && <LockClosedIcon className="h-2.5 w-2.5" aria-label="bloqueada" />}
        </button>
      );
    })}
  </div>
);

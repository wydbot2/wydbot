import type { FC } from 'react';
import type { MacroSubtypeOption } from '../../stores/macro-labels';

interface SubtypeMenuItemProps {
  option: MacroSubtypeOption;
  showHint?: boolean;
}

export const SubtypeMenuItem: FC<SubtypeMenuItemProps> = ({ option, showHint = true }) => (
  <div className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-xs">
    <span className="flex items-center gap-2 truncate">
      <span aria-hidden="true" className="w-3" />
      <span className={`truncate ${option.textColorClass}`}>{option.label}</span>
    </span>
    {showHint && (
      <span className="shrink-0 font-mono text-[10px] tracking-wide text-gray-500">
        {option.hint}
      </span>
    )}
  </div>
);

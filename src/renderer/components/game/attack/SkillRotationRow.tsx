import { type FC, useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { formatRemaining } from '../../../lib/format';

export interface SkillSlot {
  priority: number;
  skill: { id: number; name: string; iconUrl: string | null } | null;
  cooldownEndsMs: number | null;
}

interface SkillRotationRowProps {
  slot: SkillSlot;
  isActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const computeRemaining = (cooldownEndsMs: number | null): number => {
  if (cooldownEndsMs == null) return 0;
  return Math.max(0, Math.floor((cooldownEndsMs - Date.now()) / 1000));
};

export const SkillRotationRow: FC<SkillRotationRowProps> = ({
  slot,
  isActive,
  disabled,
  onClick,
}) => {
  const { priority, skill } = slot;

  const [remaining, setRemaining] = useState(() => computeRemaining(slot.cooldownEndsMs));

  useEffect(() => {
    setRemaining(computeRemaining(slot.cooldownEndsMs));
    if (slot.cooldownEndsMs == null) return;
    const id = setInterval(() => {
      const next = computeRemaining(slot.cooldownEndsMs);
      setRemaining(next);
      if (next === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [slot.cooldownEndsMs]);

  const onCd = remaining > 0;

  const borderClass = isActive
    ? 'border-cyan-400/55 bg-cyan-400/[0.06]'
    : skill
      ? 'border-cyan-400/30 bg-gray-900/60'
      : 'border-dashed border-gray-600/60 bg-gray-900/40';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        skill
          ? `Slot ${priority}: ${skill.name} — clique para alterar`
          : `Slot ${priority} vazio — clique para selecionar`
      }
      className={`flex h-full min-h-[2.5rem] w-full flex-1 items-center gap-2.5 rounded-md border py-1.5 pr-2.5 pl-2 transition-colors hover:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-current ${borderClass}`}
    >
      <span
        className={`w-5 shrink-0 text-center font-mono text-xs tabular-nums ${isActive ? 'text-cyan-300' : 'text-gray-500'}`}
      >
        {priority}
      </span>
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-gray-700 bg-gray-800"
        aria-hidden="true"
      >
        {skill?.iconUrl ? (
          <img src={skill.iconUrl} className="h-6 w-6" alt="" />
        ) : skill ? (
          <span className="h-6 w-6" />
        ) : (
          <PlusIcon className="h-4 w-4 text-gray-500" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span
          className={`truncate text-sm font-medium ${skill ? (onCd ? 'text-gray-400' : 'text-gray-200') : 'text-gray-500'}`}
        >
          {skill ? skill.name : 'Vazio'}
        </span>
        {onCd && (
          <span
            className={`shrink-0 font-mono text-xs tabular-nums ${isActive ? 'text-cyan-300' : 'text-gray-500'}`}
          >
            {formatRemaining(remaining)}
          </span>
        )}
      </div>
    </button>
  );
};

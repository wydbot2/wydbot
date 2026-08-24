import type { FC } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { Button } from '../../shared/Button';
import type { SkillCatalogEntry } from '../attack/attack-catalog';

/** Static chip mirroring the BuffChip visual idiom — selectable, not affect-bound. */
export const SkillChip: FC<{
  skill: SkillCatalogEntry;
  disabled: boolean;
  onRemove: () => void;
}> = ({ skill, disabled, onRemove }) => (
  <div
    className="group inline-flex shrink-0 items-center gap-2 rounded-md border border-cyan-400/30 bg-gray-900/60 py-1 pr-1 pl-1 transition-colors hover:border-cyan-400/60"
    title={skill.name}
  >
    <span className="inline-flex items-center gap-2 pr-1">
      <span className="grid h-7 w-7 place-items-center rounded-sm border border-gray-700 bg-gray-800">
        {skill.iconUrl ? (
          <img src={skill.iconUrl} className="h-6 w-6" alt="" draggable={false} />
        ) : (
          <span className="h-6 w-6" />
        )}
      </span>
      <span className="text-[11px] font-semibold text-gray-300">{skill.name}</span>
    </span>
    <Button
      variant="ghost-danger"
      size="icon-xs"
      onClick={onRemove}
      disabled={disabled}
      aria-label={`Remover ${skill.name}`}
    >
      <XMarkIcon className="h-3.5 w-3.5" />
    </Button>
  </div>
);

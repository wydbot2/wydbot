import type { FC, MouseEvent } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';

interface RowActionsProps {
  itemLabel: string;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit?: () => void;
  onRemove: () => void;
}

// row-level onClick may select the step — keep button clicks from bubbling
const stop = (handler?: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  handler?.();
};

export const RowActions: FC<RowActionsProps> = ({
  itemLabel,
  isFirst,
  isLast,
  disabled,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}) => (
  <div className="flex items-center justify-end gap-1">
    <div className="flex flex-col items-center">
      <Tooltip content="Mover para cima" placement="top">
        <Button
          variant="ghost-muted"
          size="icon-xs"
          onClick={stop(onMoveUp)}
          disabled={disabled || isFirst || !onMoveUp}
          aria-label={`Mover ${itemLabel} para cima`}
        >
          <ChevronUpIcon className="h-3 w-3" />
        </Button>
      </Tooltip>
      <Tooltip content="Mover para baixo" placement="top">
        <Button
          variant="ghost-muted"
          size="icon-xs"
          onClick={stop(onMoveDown)}
          disabled={disabled || isLast || !onMoveDown}
          aria-label={`Mover ${itemLabel} para baixo`}
        >
          <ChevronDownIcon className="h-3 w-3" />
        </Button>
      </Tooltip>
    </div>
    {onEdit && (
      <Tooltip content="Editar" placement="top">
        <Button
          variant="ghost-muted"
          size="icon-xs"
          onClick={stop(onEdit)}
          disabled={disabled}
          aria-label={`Editar ${itemLabel}`}
        >
          <PencilSquareIcon className="h-3 w-3" />
        </Button>
      </Tooltip>
    )}
    <Tooltip content="Remover" placement="top">
      <Button
        variant="ghost-danger"
        size="icon-xs"
        onClick={stop(onRemove)}
        disabled={disabled}
        aria-label={`Remover ${itemLabel}`}
      >
        <TrashIcon className="h-3 w-3" />
      </Button>
    </Tooltip>
  </div>
);

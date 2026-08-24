import { type FC, type ReactNode, useEffect, useRef } from 'react';
import { ChevronRightIcon, MapPinIcon, ExclamationCircleIcon } from '@heroicons/react/20/solid';
import type { MacroStep } from '../../stores/macro-types';
import {
  CATEGORY_LABELS,
  KIND_TO_CATEGORY,
  getStepAnchor,
  getStepDetailValue,
  getStepSubtypeLabel,
  getStepSubtypeTextColor,
} from '../../stores/macro-labels';
import { Tooltip } from '../shared/Tooltip';
import { CategoryDot } from './CategoryDot';
import { CatIcon } from './CatChip';
import { findNpcsByName } from '../../lib/entity-selectors';
import { interactServiceCategory } from '../../lib/interact-service';
import { ListPanel } from './ListPanel';
import { RowActions } from './RowActions';
import { scrollRowIntoView } from '../../lib/scroll-into-view';

interface StepTableProps {
  steps: MacroStep[];
  onRemove: (id: string) => void;
  onMove?: (id: string, direction: 'up' | 'down') => void;
  activeIndex?: number;
  selectedIndex?: number | null;
  onSelectStep?: (index: number | null) => void;
  /** Triggered by the edit (pencil) icon click. */
  onEdit?: (stepId: string) => void;
  isRunning?: boolean;
  errorMessage?: string | null;
  addForm?: ReactNode;
}

const Coord: FC<{ value: number | null | undefined }> = ({ value }) =>
  value == null ? (
    <span className="font-mono text-gray-600">—</span>
  ) : (
    <span className="font-mono text-gray-300 tabular-nums">{value}</span>
  );

const StepDetail: FC<{ step: MacroStep }> = ({ step }) => {
  const value = getStepDetailValue(step);
  const tone = getStepSubtypeTextColor(step);
  const label = getStepSubtypeLabel(step);
  // Interact chip from service payload SoT; follow uses live wire hint only.
  const npcCategory =
    step.kind === 'interact'
      ? (interactServiceCategory(step.target) ??
        findNpcsByName(step.target.npcName)[0]?.npcCategory)
      : step.kind === 'follow'
        ? findNpcsByName(step.target.npcName)[0]?.npcCategory
        : undefined;

  if (value == null) {
    return <span className={tone}>{label}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className={tone}>{label}</span>
      <ChevronRightIcon className="h-3 w-3 shrink-0 text-gray-600" aria-hidden="true" />
      <span className="truncate font-mono text-gray-300">{value}</span>
      {npcCategory && <CatIcon category={npcCategory} />}
    </span>
  );
};

const EmptyState: FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
    <MapPinIcon className="h-8 w-8 text-gray-600" aria-hidden="true" />
    <span className="text-sm font-medium text-gray-400">Nenhum passo adicionado</span>
    <span className="text-xs text-gray-500">Clique no mapa ou use o formulario abaixo</span>
  </div>
);

export const StepTable: FC<StepTableProps> = ({
  steps,
  onRemove,
  onMove,
  activeIndex,
  selectedIndex,
  onSelectStep,
  onEdit,
  isRunning,
  errorMessage,
  addForm,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const lastRowRef = useRef<HTMLTableRowElement>(null);
  const prevStepCount = useRef(steps.length);

  useEffect(() => {
    if (activeIndex == null) return;
    scrollRowIntoView(scrollRef.current, activeRowRef.current);
  }, [activeIndex]);

  useEffect(() => {
    if (steps.length > prevStepCount.current) {
      scrollRowIntoView(scrollRef.current, lastRowRef.current);
    }
    prevStepCount.current = steps.length;
  }, [steps.length]);

  return (
    <ListPanel className="min-h-0 flex-1" footer={addForm}>
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
        {steps.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800 text-left text-[11px] font-semibold tracking-[0.08em] text-gray-300 uppercase">
                <th className="w-12 px-3 py-2.5">#</th>
                <th className="w-16 px-3 py-2.5">X</th>
                <th className="w-16 px-3 py-2.5">Y</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="w-28 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {steps.map((step, i) => {
                const isActive = activeIndex === i;
                const isSelected = selectedIndex === i;
                const isClickable = !isRunning && !!onSelectStep;
                const isErrored = isActive && !!errorMessage;
                const anchor = getStepAnchor(step);

                const rowClass = isErrored
                  ? 'bg-red-500/15'
                  : isActive
                    ? 'bg-cyan-500/20'
                    : isSelected
                      ? 'bg-blue-500/20'
                      : 'hover:bg-gray-700/30';

                const borderClass = isErrored
                  ? 'border-l-2 border-l-red-400'
                  : isActive
                    ? 'border-l-2 border-l-cyan-400'
                    : isSelected
                      ? 'border-l-2 border-l-blue-400'
                      : 'border-l-2 border-l-transparent';

                const indexClass = isErrored
                  ? 'font-bold text-red-400'
                  : isActive
                    ? 'font-bold text-cyan-400'
                    : isSelected
                      ? 'font-bold text-blue-400'
                      : 'text-gray-500';

                const isLast = i === steps.length - 1;

                return (
                  <tr
                    ref={(el) => {
                      if (isActive) activeRowRef.current = el;
                      if (isLast) lastRowRef.current = el;
                    }}
                    key={step.id}
                    className={`border-b border-gray-700/50 text-gray-300 last:border-0 ${rowClass} ${
                      isClickable ? 'cursor-pointer' : ''
                    }`}
                    onClick={isClickable ? () => onSelectStep(isSelected ? null : i) : undefined}
                  >
                    <td className={`py-2 pr-3 pl-2.5 align-top ${borderClass} ${indexClass}`}>
                      <span className="inline-flex items-center gap-1">
                        {i + 1}
                        {isErrored && errorMessage && (
                          <Tooltip content={errorMessage} placement="right" variant="error">
                            <span
                              className="inline-flex shrink-0"
                              aria-label={`Erro no passo ${i + 1}`}
                            >
                              <ExclamationCircleIcon
                                className="h-3.5 w-3.5 text-red-400"
                                aria-hidden="true"
                              />
                            </span>
                          </Tooltip>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Coord value={anchor?.x} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Coord value={anchor?.y} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <CategoryDot category={KIND_TO_CATEGORY[step.kind]} size="md" alignTop />
                        <div className="min-w-0 leading-tight">
                          <div className="text-[10px] font-medium tracking-wide text-gray-500 uppercase">
                            {CATEGORY_LABELS[KIND_TO_CATEGORY[step.kind]]}
                          </div>
                          <div className="mt-0.5 truncate text-xs">
                            <StepDetail step={step} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3 pl-1 align-middle">
                      <RowActions
                        itemLabel={`passo ${i + 1}`}
                        isFirst={i === 0}
                        isLast={isLast}
                        disabled={isRunning}
                        onMoveUp={onMove ? () => onMove(step.id, 'up') : undefined}
                        onMoveDown={onMove ? () => onMove(step.id, 'down') : undefined}
                        onEdit={onEdit ? () => onEdit(step.id) : undefined}
                        onRemove={() => onRemove(step.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </ListPanel>
  );
};

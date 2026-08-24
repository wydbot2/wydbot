import { type FC, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/20/solid';
import type { Entity } from '@shared/types';
import type { ZonePortal } from '@shared/constants/zone-portals';
import { useCursorMenu } from './useCursorMenu';
import {
  CATEGORY_LABELS,
  MACRO_SUBTYPE_OPTIONS,
  type MacroStepCategory,
  type MacroStepSubtype,
} from '../../stores/macro-labels';
import { CategoryDot } from './CategoryDot';
import { CategoryGroupHeader } from './CategoryGroupHeader';
import { SubtypeMenuItem } from './SubtypeMenuItem';

export type CascadePick = MacroStepSubtype | 'attack-target';

interface StepContextCascadeMenuProps {
  position: { x: number; y: number };
  contextLabel: string;
  entity?: Entity;
  portal?: ZonePortal;
  onPick: (pick: CascadePick) => void;
  onClose: () => void;
}

const CASCADE_CATEGORIES: ReadonlyArray<MacroStepCategory> = ['walk', 'npc', 'portal', 'attack'];

const isCategoryEnabled = (
  cat: MacroStepCategory,
  entity?: Entity,
  portal?: ZonePortal,
): boolean => {
  switch (cat) {
    case 'walk':
      return true;
    case 'npc':
      return entity?.category === 'npc';
    case 'portal':
      return portal !== undefined;
    case 'attack':
      return entity?.category === 'monster';
    case 'others':
      return false;
  }
};

/** Categories that open a right pane (portal fires immediately on click). */
const hasCascadePane = (cat: MacroStepCategory): boolean => cat !== 'portal';

export const StepContextCascadeMenu: FC<StepContextCascadeMenuProps> = ({
  position,
  contextLabel,
  entity,
  portal,
  onPick,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<MacroStepCategory | null>(null);

  const { refs, floatingStyles, placement } = useCursorMenu(position, onClose, {
    placement: 'bottom-start',
    fallbackPlacements: ['bottom-end', 'top-start', 'top-end'],
  });

  const showRightPane =
    activeCategory !== null &&
    hasCascadePane(activeCategory) &&
    isCategoryEnabled(activeCategory, entity, portal);
  const subtypesForActive =
    activeCategory && activeCategory !== 'attack' && activeCategory !== 'portal'
      ? MACRO_SUBTYPE_OPTIONS.filter((o) => o.category === activeCategory)
      : [];

  const isCascadeReversed = placement.endsWith('-end');
  const ChevronCascade = isCascadeReversed ? ChevronLeftIcon : ChevronRightIcon;

  return createPortal(
    <div
      ref={refs.setFloating}
      role="menu"
      aria-label="Adicionar passo"
      className={`z-50 flex gap-1 ${isCascadeReversed ? 'flex-row-reverse' : ''}`}
      style={floatingStyles}
    >
      <div className="w-44 overflow-hidden rounded-md border border-gray-600 bg-gray-800/95 py-1 text-xs shadow-xl ring-1 ring-black/30 backdrop-blur">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900/60 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-gray-300">
            <PlusIcon className="h-3 w-3 text-gray-400" />
            <span className="text-[11px]">Adicionar</span>
          </span>
          <span className="font-mono text-[10px] text-gray-400 tabular-nums">{contextLabel}</span>
        </div>
        {CASCADE_CATEGORIES.map((cat) => {
          const enabled = isCategoryEnabled(cat, entity, portal);
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              disabled={!enabled}
              onMouseEnter={() => {
                if (!enabled) return;
                if (hasCascadePane(cat)) setActiveCategory(cat);
                else setActiveCategory(null);
              }}
              onClick={() => {
                if (!enabled) return;
                if (cat === 'portal') {
                  onPick('portal-teleport');
                  return;
                }
                setActiveCategory(cat);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                !enabled
                  ? 'cursor-not-allowed text-gray-600'
                  : active
                    ? 'bg-gray-700/50 text-gray-100'
                    : 'text-gray-300 hover:bg-gray-700/40'
              }`}
            >
              <CategoryDot category={cat} size="sm" />
              <span className="text-[11px]">{CATEGORY_LABELS[cat]}</span>
              {!enabled && <span className="ml-auto text-[9px] text-gray-600">—</span>}
              {enabled && active && hasCascadePane(cat) && (
                <ChevronCascade className="ml-auto h-3 w-3 text-gray-500" />
              )}
            </button>
          );
        })}
      </div>

      {showRightPane ? (
        <div className="w-44 overflow-hidden rounded-md border border-gray-600 bg-gray-800/95 py-1 text-xs shadow-xl ring-1 ring-black/30 backdrop-blur">
          <CategoryGroupHeader category={activeCategory} />
          {activeCategory === 'attack' && entity ? (
            <button
              type="button"
              onClick={() => onPick('attack-target')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent-600/30"
            >
              <span className="text-[11px] font-medium text-purple-300">Alvo</span>
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-gray-600" />
              <span className="truncate text-[11px] text-gray-300">{entity.name}</span>
            </button>
          ) : (
            subtypesForActive.map((option) => (
              <button
                key={option.subtype}
                type="button"
                onClick={() => onPick(option.subtype)}
                className="block w-full text-left hover:bg-accent-600/30"
              >
                <SubtypeMenuItem option={option} showHint={false} />
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="invisible w-44" aria-hidden="true" />
      )}
    </div>,
    document.body,
  );
};

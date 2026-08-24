import { type FC } from 'react';
import type { ImmovableTier, ViewItem } from '@shared/types/item-types';
import { type DesignRow, type DesignTier, toDesignItem } from '../../lib/item-design-adapter';
import { CopyButton } from '../shared/CopyButton';

const TIER_COLORS: Record<DesignTier, string> = {
  normal: 'text-gray-100',
  green: 'text-gray-300',
  yellow: 'text-yellow-400',
  orange: 'text-orange-400',
  blue: 'text-accent-400',
  pvp: 'text-red-400',
};

// Placeholders — verbatim PT-BR is not in WYD.exe; refine after live verification.
const IMMOVABLE_LABELS: Record<ImmovableTier, string> = {
  1: 'Imóvel',
  2: 'Não Transferível',
  3: 'Vinculado ao Personagem',
};

export const SECTION_BASE = 'border-t border-gray-800/70 px-3.5 py-2 space-y-0.5';
export const STAT_ROW_BASE = 'flex items-baseline justify-between gap-3 text-xs leading-normal';

export interface ItemTooltipContentProps {
  item: ViewItem;
  label?: string;
}

export const ItemTooltipContent: FC<ItemTooltipContentProps> = ({ item, label }) => {
  const design = toDesignItem(item, label);
  const mountVisual = item.mountVisual;
  const mountToShow =
    mountVisual &&
    (mountVisual.scaleRatio !== 1 ||
      mountVisual.refineBonusIndex > 0 ||
      mountVisual.slotColors.some((c) => c !== -1 && c !== 0))
      ? mountVisual
      : undefined;

  return (
    <div>
      <div className="px-3.5 pt-3 pb-2.5">
        {design.slotLabel !== undefined && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-flex items-center rounded-sm bg-gray-700/55 px-[7px] py-px text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase">
              {design.slotLabel}
            </span>
            <CopyButton
              value={String(design.id)}
              label={`ID ${design.id}`}
              ariaLabel={`Copiar ID ${design.id}`}
              className="ml-auto"
            />
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
          <span className="text-base font-semibold tracking-[-0.01em] text-gray-100">
            {design.name}
          </span>
          {design.refine !== undefined && (
            <span className="font-mono text-sm font-semibold text-accent-400 tabular-nums">
              +{design.refine}
            </span>
          )}
          {design.titleCount !== undefined && (
            <span className="font-mono text-sm font-semibold text-gray-300 tabular-nums">
              ({design.titleCount})
            </span>
          )}
          {design.gem !== undefined && (
            <span className="font-mono text-sm font-semibold text-accent-400 tabular-nums">
              [{design.gem}]
            </span>
          )}
          {design.slotLabel === undefined && (
            <CopyButton
              value={String(design.id)}
              label={`ID ${design.id}`}
              ariaLabel={`Copiar ID ${design.id}`}
              className="ml-auto"
            />
          )}
        </div>
      </div>

      {item.stackCount !== undefined && design.titleCount === undefined && (
        <div className={SECTION_BASE}>
          <div className={STAT_ROW_BASE}>
            <span className="min-w-0 flex-auto">Quantidade</span>
            <span className="flex-none font-mono tabular-nums">{item.stackCount}</span>
          </div>
        </div>
      )}

      {design.requirements.length > 0 && (
        <div className={SECTION_BASE}>
          {design.requirements.map((row, i) => (
            <StatRow key={i} row={row} />
          ))}
        </div>
      )}

      {design.stats.length > 0 && (
        <div className={SECTION_BASE}>
          {design.stats.map((row, i) => (
            <StatRow key={i} row={row} />
          ))}
        </div>
      )}

      {design.bonuses.length > 0 && (
        <div className={SECTION_BASE}>
          {design.bonuses.map((row, i) => (
            <StatRow key={i} row={row} />
          ))}
        </div>
      )}

      {design.help.length > 0 && (
        <div className="space-y-0.5 border-t border-gray-800/70 px-3.5 pt-2 pb-2.5 text-xs leading-normal text-gray-300 italic">
          {design.help.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {design.immovable !== undefined && (
        <div className="border-t border-gray-800/70 px-3.5 py-2 text-xs leading-normal font-semibold text-red-400">
          {IMMOVABLE_LABELS[design.immovable]}
        </div>
      )}

      {mountToShow && (
        <div className={`${SECTION_BASE} text-xs text-gray-300`}>
          {mountToShow.scaleRatio !== 1 && (
            <div className={STAT_ROW_BASE}>
              <span className="min-w-0 flex-auto">Escala</span>
              <span className="flex-none font-mono tabular-nums">
                {mountToShow.scaleRatio.toFixed(2)}
              </span>
            </div>
          )}
          {mountToShow.refineBonusIndex > 0 && (
            <div className={STAT_ROW_BASE}>
              <span className="min-w-0 flex-auto">Bônus de Refinamento</span>
              <span className="flex-none font-mono tabular-nums">
                {mountToShow.refineBonusIndex}
              </span>
            </div>
          )}
          {mountToShow.slotColors.some((c) => c !== -1 && c !== 0) && (
            <div className={STAT_ROW_BASE}>
              <span className="min-w-0 flex-auto">Cores</span>
              <span className="flex-none font-mono tabular-nums">
                {mountToShow.slotColors.map((c) => (c === -1 ? '—' : c)).join(' ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StatRow: FC<{ row: DesignRow }> = ({ row }) => (
  <div className={`${STAT_ROW_BASE} ${TIER_COLORS[row.tier]}`}>
    <span className="min-w-0 flex-auto">{row.label}</span>
    <span className="flex-none font-mono tabular-nums">
      {row.value}
      {row.raw !== undefined && <span className="ml-1 text-[10px] text-gray-500">({row.raw})</span>}
    </span>
  </div>
);

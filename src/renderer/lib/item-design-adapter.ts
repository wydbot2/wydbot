import { MItemDefinition } from '@shared/constants/item-definitions';
import type { ImmovableTier, ViewItem, ViewItemEffect } from '@shared/types/item-types';
import { formatEffectValueText } from './item-enrich';

export type DesignTier = 'normal' | 'green' | 'yellow' | 'orange' | 'blue' | 'pvp';

export interface DesignRow {
  label: string;
  value: string;
  raw?: string;
  tier: DesignTier;
}

export interface DesignItem {
  id: number;
  slotLabel?: string;
  name: string;
  refine?: number;
  gem?: string;
  titleCount?: number;
  immovable?: ImmovableTier;
  requirements: DesignRow[];
  stats: DesignRow[];
  bonuses: DesignRow[];
  help: string[];
}

const REQUIREMENT_INDICES: ReadonlySet<number> = new Set([
  MItemDefinition.LEVEL,
  MItemDefinition.CLASS,
  MItemDefinition.REQ_STR,
  MItemDefinition.REQ_INT,
  MItemDefinition.REQ_DEX,
  MItemDefinition.REQ_CON,
]);

const toRow = (effect: ViewItemEffect): DesignRow => {
  const tier: DesignTier = effect.colorTier ?? 'normal';

  if (effect.displayText === effect.label) {
    return { label: effect.label, value: '', tier };
  }

  if (
    effect.source === 'wire' &&
    effect.rawValue !== undefined &&
    effect.rawValue !== effect.value
  ) {
    return {
      label: effect.label,
      value: formatEffectValueText(effect.index, effect.rawValue),
      raw: formatEffectValueText(effect.index, effect.value),
      tier,
    };
  }

  return {
    label: effect.label,
    value: formatEffectValueText(effect.index, effect.value),
    tier,
  };
};

export const toDesignItem = (item: ViewItem, slotLabel?: string): DesignItem => {
  const visible = item.effects.filter((e) => !e.hidden && e.index !== 0);

  const requirements = visible.filter((e) => REQUIREMENT_INDICES.has(e.index)).map(toRow);

  const stats = visible
    .filter(
      (e) => e.source === 'base' && !REQUIREMENT_INDICES.has(e.index) && e.colorTier !== 'pvp',
    )
    .map(toRow);

  const bonuses = visible
    .filter(
      (e) =>
        e.source === 'wire' ||
        e.source === 'hardcoded' ||
        (e.source === 'base' && e.colorTier === 'pvp'),
    )
    .map(toRow);

  return {
    id: item.index,
    slotLabel,
    name: item.displayName,
    refine: item.refineLevel,
    gem: item.gemLetter,
    titleCount: item.titleCount,
    immovable: item.immovable,
    requirements,
    stats,
    bonuses,
    help: item.helpLines?.map((l) => l.text) ?? [],
  };
};

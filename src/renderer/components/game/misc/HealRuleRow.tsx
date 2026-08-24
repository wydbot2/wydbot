import { PlusIcon } from '@heroicons/react/20/solid';
import { type FC, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { ECharClass } from '@shared/types/game-structures';
import type { HealAction } from '@shared/app-config/v1/sections/auto-healing';
import { isFoodForMount } from '@shared/constants/mount-food-pairs';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { usePlayerStore } from '../../../stores/player-store';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { NumberInput } from '../../shared/NumberInput';
import { Switch } from '../../shared/Switch';
import { HealChip } from './HealChip';
import { HealActionPickerModal } from './HealActionPickerModal';
import {
  buildCureSkillCatalog,
  buildHpHealSkillCatalog,
  HERB_ITEM_FILTER,
  HP_ITEM_FILTER,
  MP_ITEM_FILTER,
  type HealItemFilter,
} from './heal-catalogs';
import { getItem, getSkill } from '../../../lib/item-db';
import type { SkillCatalogEntry } from '../attack/attack-catalog';

export type HealRuleKind = 'hp' | 'mp' | 'mount' | 'debuff';

interface HealRuleRowProps {
  kind: HealRuleKind;
  disabled: boolean;
}

interface RuleMeta {
  label: string;
  comparator: '≤' | null; // null = event-triggered (debuff)
  itemFilter: HealItemFilter;
  /** Empty list = no Skills tab (MP rejects skills by schema). */
  buildSkills: (
    learnedSkill: readonly [number, number],
    charClass: ECharClass,
  ) => SkillCatalogEntry[];
}

const NO_SKILLS: () => SkillCatalogEntry[] = () => [];

const META: Record<HealRuleKind, RuleMeta> = {
  hp: {
    label: 'HP',
    comparator: '≤',
    itemFilter: HP_ITEM_FILTER,
    buildSkills: buildHpHealSkillCatalog,
  },
  mp: { label: 'MP', comparator: '≤', itemFilter: MP_ITEM_FILTER, buildSkills: NO_SKILLS },
  mount: {
    label: 'Montaria',
    comparator: '≤',
    itemFilter: (it) => {
      const equippedMountId = usePlayerStore.getState().mount.itemId;
      if (equippedMountId === 0) return false;
      return isFoodForMount(equippedMountId, it.id);
    },
    buildSkills: NO_SKILLS,
  },
  debuff: {
    label: 'Debuff',
    comparator: null,
    itemFilter: HERB_ITEM_FILTER,
    buildSkills: buildCureSkillCatalog,
  },
};

const resolveActionName = (action: HealAction): string => {
  if (action.kind === 'item') return getItem(action.refId)?.name ?? `#${action.refId}`;
  return getSkill(action.refId)?.name ?? `Skill #${action.refId}`;
};

/**
 * One inline rule line.
 *
 * Shape: `[Switch] LABEL ≤ [NumberInput N]% → [HealChip[]] [+ adicionar]`
 * (debuff omits the threshold and shows `ativo` text).
 */
export const HealRuleRow: FC<HealRuleRowProps> = ({ kind, disabled }) => {
  const meta = META[kind];

  const { config, updateMountFeed, updateHp, updateMp, updateCure } = useAppConfigStore(
    useShallow((s) => ({
      config: s.config.misc?.autoHealing,
      updateMountFeed: s.updateMiscAutoHealingMountFeed,
      updateHp: s.updateMiscAutoHealingHp,
      updateMp: s.updateMiscAutoHealingMp,
      updateCure: s.updateMiscAutoHealingDebuffCure,
    })),
  );
  const { learnedSkill, charClass } = usePlayerStore(
    useShallow((s) => ({ learnedSkill: s.learnedSkill, charClass: s.charClass })),
  );

  const skillCatalog = useMemo(
    () => meta.buildSkills(learnedSkill, charClass as ECharClass),
    [meta, learnedSkill, charClass],
  );

  const sub =
    kind === 'hp'
      ? config?.hp
      : kind === 'mp'
        ? config?.mp
        : kind === 'mount'
          ? config?.mountFeed
          : config?.debuffCure;

  const enabled = sub?.enabled ?? false;
  const actions = sub?.actions ?? [];
  const threshold = (
    kind !== 'debuff' && sub && 'thresholdPct' in sub
      ? sub.thresholdPct
      : kind === 'mp' || kind === 'mount'
        ? 30
        : 60
  ) as number;

  const rowDim = disabled || !enabled;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<HealAction | null>(null);

  const applyPatch = (patch: {
    enabled?: boolean;
    thresholdPct?: number;
    actions?: HealAction[];
  }): void => {
    if (kind === 'hp') updateHp(patch as Parameters<typeof updateHp>[0]);
    else if (kind === 'mp')
      updateMp({
        ...(patch.enabled !== undefined && { enabled: patch.enabled }),
        ...(patch.thresholdPct !== undefined && { thresholdPct: patch.thresholdPct }),
        ...(patch.actions !== undefined && {
          actions: patch.actions.filter(
            (a): a is { kind: 'item'; refId: number } => a.kind === 'item',
          ),
        }),
      });
    else if (kind === 'mount') updateMountFeed(patch as Parameters<typeof updateMountFeed>[0]);
    else updateCure(patch as Parameters<typeof updateCure>[0]);
  };

  const handleAdd = (action: HealAction): void => {
    if (actions.some((a) => a.kind === action.kind && a.refId === action.refId)) return;
    applyPatch({ actions: [...actions, action] });
  };

  const handleRemove = (action: HealAction): void => {
    applyPatch({
      actions: actions.filter((a) => !(a.kind === action.kind && a.refId === action.refId)),
    });
  };

  const thresholdRange = kind === 'mount' ? { min: 30, max: 90 } : { min: 1, max: 99 };

  return (
    <div className="flex min-h-[32px] flex-wrap items-center gap-3 border-b border-gray-800 py-1.5 last:border-b-0">
      <Switch
        checked={enabled}
        onChange={(v) => applyPatch({ enabled: v })}
        disabled={disabled}
        aria-label={`Ativar ${meta.label}`}
      />
      <div
        className={`w-20 shrink-0 text-[12px] font-medium ${rowDim ? 'text-gray-500' : 'text-gray-200'}`}
      >
        {meta.label}
      </div>

      {meta.comparator !== null ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[10.5px] text-gray-500">{meta.comparator}</span>
          <NumberInput
            value={threshold}
            min={thresholdRange.min}
            max={thresholdRange.max}
            onChange={(v) => applyPatch({ thresholdPct: v })}
            disabled={rowDim}
            ariaLabel={`Limiar ${meta.label}`}
          />
          <span className="font-mono text-[10.5px] text-gray-500">%</span>
        </div>
      ) : (
        <span className="shrink-0 font-mono text-[10.5px] text-gray-500">ativo</span>
      )}

      <span className="font-mono text-[10.5px] text-gray-600 select-none">→</span>

      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
        style={{ opacity: rowDim ? 0.55 : 1 }}
      >
        {actions.length === 0 && (
          <span className="self-center text-[11px] text-gray-500">Nenhuma ação selecionada</span>
        )}
        {actions.map((action) => (
          <HealChip
            key={`${action.kind}-${action.refId}`}
            action={action}
            onRemove={() => setConfirmAction(action)}
            disabled={rowDim}
          />
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={rowDim}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 px-1.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:border-cyan-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3 w-3" />
          adicionar
        </button>
      </div>

      <HealActionPickerModal
        isOpen={pickerOpen}
        title={`Adicionar ação · ${meta.label}`}
        itemFilter={meta.itemFilter}
        skillCatalog={skillCatalog}
        existingActions={actions}
        initialTab={skillCatalog.length === 0 ? 'item' : 'item'}
        onPick={(action) => {
          handleAdd(action);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title="Remover ação"
        message={
          confirmAction
            ? `Remover «${resolveActionName(confirmAction)}» da regra ${meta.label}?`
            : ''
        }
        confirmLabel="Remover"
        onConfirm={() => {
          if (confirmAction) handleRemove(confirmAction);
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};

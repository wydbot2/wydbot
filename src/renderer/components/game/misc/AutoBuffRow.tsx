import { type FC, useMemo, useState } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import type { ECharClass } from '@shared/types/game-structures';
import { MISC_AUTO_BUFF_MAX } from '@shared/app-config';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { usePlayerStore } from '../../../stores/player-store';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { SkillPickerModal } from '../attack/SkillPickerModal';
import type { SkillCatalogEntry } from '../attack/attack-catalog';
import { MiscCard } from './MiscCard';
import { SkillChip } from './SkillChip';
import { buildBuffCatalog, resolveBuffSkills } from './buff-catalog';

interface AutoBuffRowProps {
  disabled: boolean;
}

/** Stable empty sentinel — a fresh `[]` per render destabilizes the useMemo deps. */
const EMPTY_IDS: readonly number[] = [];

export const AutoBuffRow: FC<AutoBuffRowProps> = ({ disabled }) => {
  const { autoBuff, updateMiscAutoBuff } = useAppConfigStore(
    useShallow((s) => ({
      autoBuff: s.config.misc?.autoBuff,
      updateMiscAutoBuff: s.updateMiscAutoBuff,
    })),
  );
  const { learnedSkill, charClass } = usePlayerStore(
    useShallow((s) => ({ learnedSkill: s.learnedSkill, charClass: s.charClass })),
  );

  const catalog = useMemo(
    () => buildBuffCatalog(learnedSkill, charClass as ECharClass),
    [learnedSkill, charClass],
  );

  const enabled = autoBuff?.enabled ?? false;
  const selectedIds = autoBuff?.skills ?? EMPTY_IDS;
  const selected = useMemo(() => resolveBuffSkills(selectedIds, catalog), [selectedIds, catalog]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<SkillCatalogEntry | null>(null);
  const atMax = selectedIds.length >= MISC_AUTO_BUFF_MAX;

  const removeAt = (skillId: number): void =>
    updateMiscAutoBuff({ skills: selectedIds.filter((id) => id !== skillId) });

  const addSkill = (skillId: number | null): void => {
    if (skillId == null || selectedIds.includes(skillId)) return;
    updateMiscAutoBuff({ skills: [...selectedIds, skillId] });
  };

  return (
    <MiscCard
      title="Auto Buff"
      description="Recasta automaticamente as magias de buff selecionadas do personagem."
      enabled={enabled}
      onToggle={(v) => updateMiscAutoBuff({ enabled: v })}
      disabled={disabled}
      kind="macro-coupled"
    >
      <div className="flex flex-wrap items-stretch gap-1.5">
        {selected.map((skill) => (
          <SkillChip
            key={skill.id}
            skill={skill}
            disabled={disabled}
            onRemove={() => setConfirm(skill)}
          />
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled || atMax}
          title={atMax ? `Máximo de ${MISC_AUTO_BUFF_MAX} buffs` : undefined}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 py-1.5 pr-2.5 pl-2 text-[11px] font-medium text-gray-400 transition-colors hover:border-cyan-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          adicionar
        </button>
        {selected.length === 0 && (
          <span className="self-center text-[11px] text-gray-500">Nenhuma buff selecionada</span>
        )}
      </div>

      <SkillPickerModal
        isOpen={pickerOpen}
        priority={selectedIds.length + 1}
        current={null}
        available={catalog}
        disabledIds={selectedIds}
        onClose={() => setPickerOpen(false)}
        onConfirm={addSkill}
      />

      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.name}"?`}
        message="Esse buff sai da lista de auto-buff. Você pode adicioná-lo de novo a qualquer momento."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) removeAt(confirm.id);
          setConfirm(null);
        }}
      />
    </MiscCard>
  );
};

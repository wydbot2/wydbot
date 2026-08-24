import { type FC, useMemo, useState } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import type { ECharClass } from '@shared/types/game-structures';
import { MISC_AUTO_SUMMON_RECAST_SEC } from '@shared/app-config';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { usePlayerStore } from '../../../stores/player-store';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { SkillPickerModal } from '../attack/SkillPickerModal';
import { MiscCard } from './MiscCard';
import { SkillChip } from './SkillChip';
import { buildSummonCatalog, resolveSummonSkill } from './summon-catalog';

interface AutoSummonRowProps {
  disabled: boolean;
}

export const AutoSummonRow: FC<AutoSummonRowProps> = ({ disabled }) => {
  const { autoSummon, updateMiscAutoSummon } = useAppConfigStore(
    useShallow((s) => ({
      autoSummon: s.config.misc?.autoSummon,
      updateMiscAutoSummon: s.updateMiscAutoSummon,
    })),
  );
  const { learnedSkill, charClass } = usePlayerStore(
    useShallow((s) => ({ learnedSkill: s.learnedSkill, charClass: s.charClass })),
  );

  const catalog = useMemo(
    () => buildSummonCatalog(learnedSkill, charClass as ECharClass),
    [learnedSkill, charClass],
  );

  const enabled = autoSummon?.enabled ?? false;
  const skillId = autoSummon?.skill ?? null;
  const selected = useMemo(() => resolveSummonSkill(skillId), [skillId]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <MiscCard
      title="Auto Summon"
      description={`Reinvoca a invocação escolhida a cada ${MISC_AUTO_SUMMON_RECAST_SEC} segundos. Apenas uma invocação fica ativa por vez — escolher outra substitui a atual.`}
      enabled={enabled}
      onToggle={(v) => updateMiscAutoSummon({ enabled: v })}
      disabled={disabled}
      kind="macro-coupled"
    >
      <div className="flex flex-wrap items-stretch gap-1.5">
        {selected ? (
          <SkillChip skill={selected} disabled={disabled} onRemove={() => setConfirmRemove(true)} />
        ) : (
          <span className="self-center text-[11px] text-gray-500">
            Nenhuma invocação selecionada
          </span>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 py-1.5 pr-2.5 pl-2 text-[11px] font-medium text-gray-400 transition-colors hover:border-cyan-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {selected ? 'trocar' : 'escolher'}
        </button>
      </div>

      <SkillPickerModal
        isOpen={pickerOpen}
        priority={1}
        current={selected ? { id: selected.id, name: selected.name } : null}
        available={catalog}
        onClose={() => setPickerOpen(false)}
        onConfirm={(id) => updateMiscAutoSummon({ skill: id })}
      />

      <ConfirmDialog
        isOpen={confirmRemove}
        title={`Remover "${selected?.name}"?`}
        message="A invocação sai do auto-summon. Você pode escolhê-la de novo a qualquer momento."
        confirmLabel="Remover"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          updateMiscAutoSummon({ skill: null });
          setConfirmRemove(false);
        }}
      />
    </MiscCard>
  );
};

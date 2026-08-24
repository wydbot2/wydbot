import { type FC, useEffect, useMemo, useState } from 'react';
import { Fieldset, Legend, Radio, RadioGroup } from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import {
  VALIDATION_MSG,
  hasMonsterConflict,
  type AttackMode,
  type AttackTargeting,
  type MonsterTarget,
} from '@shared/app-config';
import type { ECharClass } from '@shared/types/game-structures';
import {
  DEFAULT_ATTACK_RANGE,
  DEFAULT_DETECTION_RADIUS,
  DEFAULT_GIVEUP_TIMEOUT_SEC,
} from '@shared/constants/attack';
import { EMPTY_MONSTERS, useAppConfigStore } from '../../../stores/app-config-store';
import { useMacroLifecycleStore } from '../../../stores/macro-lifecycle-store';
import { MacroStatus } from '../../../stores/macro-status';
import { usePlayerStore } from '../../../stores/player-store';
import { useAttackTarget } from '../../../hooks/use-attack-target';
import { useSkillCooldowns } from '../../../hooks/use-skill-cooldowns';
import { Button } from '../../shared/Button';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { GlassPanel } from '../../shared/GlassPanel';
import { Switch } from '../../shared/Switch';
import { TextInput } from '../../shared/TextInput';
import { TargetingCard } from './TargetingCard';
import { MonstersTable } from './MonstersTable';
import { GiveUpRule } from './GiveUpRule';
import { SkillRotationList } from './SkillRotationList';
import { SkillPickerModal } from './SkillPickerModal';
import { buildSkillCatalog, projectRotationSlots } from './attack-catalog';

const MODE_OPTIONS: { value: AttackMode; label: string; disabled?: boolean; title?: string }[] = [
  { value: 'physical', label: 'Físico' },
  { value: 'magical', label: 'Mágico' },
];

const DEFAULT_TARGETING: AttackTargeting = {
  detectionRadius: DEFAULT_DETECTION_RADIUS,
  attackRange: DEFAULT_ATTACK_RANGE,
};

export const AttackSection: FC = () => {
  const {
    attack,
    updateAttackEnabled,
    updateAttackMode,
    updateAttackTargeting,
    updateAttackMonsters,
    updateAttackGiveUp,
    updateAttackRotationSlot,
  } = useAppConfigStore(
    useShallow((s) => ({
      attack: s.config.attack,
      updateAttackEnabled: s.updateAttackEnabled,
      updateAttackMode: s.updateAttackMode,
      updateAttackTargeting: s.updateAttackTargeting,
      updateAttackMonsters: s.updateAttackMonsters,
      updateAttackGiveUp: s.updateAttackGiveUp,
      updateAttackRotationSlot: s.updateAttackRotationSlot,
    })),
  );
  const locked = useMacroLifecycleStore((s) => s.status) !== MacroStatus.Idle;

  const { learnedSkill, charClass } = usePlayerStore(
    useShallow((s) => ({ learnedSkill: s.learnedSkill, charClass: s.charClass })),
  );
  const skillCatalog = useMemo(
    () => buildSkillCatalog(learnedSkill, charClass as ECharClass),
    [learnedSkill, charClass],
  );

  const enabled = attack?.enabled ?? false;
  const mode: AttackMode = attack?.mode ?? 'physical';
  const monsters: readonly MonsterTarget[] = attack?.monsters ?? EMPTY_MONSTERS;
  const targeting: AttackTargeting = attack?.targeting ?? DEFAULT_TARGETING;
  const giveUpTimeout = attack?.giveUp?.timeoutSec ?? DEFAULT_GIVEUP_TIMEOUT_SEC;
  const giveUpOverrideCount = monsters.filter((m) => m.giveUpTimeoutSec != null).length;

  const { cooldowns, activePriority } = useSkillCooldowns();
  const rotationSlots = projectRotationSlots(attack?.rotation, skillCatalog, cooldowns);

  const enableDisabled = locked || monsters.length === 0;
  const enableTitle = monsters.length === 0 ? VALIDATION_MSG.attackWhitelistRequired : undefined;

  const [newMonster, setNewMonster] = useState('');
  const [pickerPriority, setPickerPriority] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; index: number } | null>(null);

  const targetName = useAttackTarget();
  const needle = targetName?.trim().toLowerCase();
  const matchIdx = needle ? monsters.findIndex((m) => m.name.trim().toLowerCase() === needle) : -1;
  const currentIndex = matchIdx >= 0 ? matchIdx : undefined;

  useEffect(() => {
    if (!locked) return;
    if (pickerPriority != null) setPickerPriority(null);
    if (deleteTarget != null) setDeleteTarget(null);
  }, [locked, pickerPriority, deleteTarget]);

  const handleAddMonster = () => {
    const name = newMonster.trim();
    if (!name) return;
    if (hasMonsterConflict(monsters, name)) {
      toast.error(VALIDATION_MSG.duplicateMonster);
      return;
    }
    updateAttackMonsters([...monsters, { name }]);
    setNewMonster('');
  };

  const handleRemoveMonster = (index: number) => {
    const target = monsters[index];
    if (!target) return;
    setDeleteTarget({ name: target.name, index });
  };

  const confirmRemoveMonster = () => {
    if (deleteTarget) {
      updateAttackMonsters(monsters.filter((_, i) => i !== deleteTarget.index));
    }
    setDeleteTarget(null);
  };

  const handleMoveMonster = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= monsters.length) return;
    const next = [...monsters];
    [next[index], next[target]] = [next[target], next[index]];
    updateAttackMonsters(next);
  };

  // timeoutSec null removes the key (sparse-save) so the monster inherits the default again.
  const handleGiveUpChange = (index: number, timeoutSec: number | null) => {
    updateAttackMonsters(
      monsters.map((m, i) => {
        if (i !== index) return m;
        return timeoutSec == null ? { name: m.name } : { ...m, giveUpTimeoutSec: timeoutSec };
      }),
    );
  };

  const monstersAddForm = (
    <div className="relative">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <TextInput
          compact
          value={newMonster}
          onChange={(e) => setNewMonster((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddMonster();
            }
          }}
          placeholder="Nome do monstro"
          aria-label="Nome do monstro"
          disabled={locked}
          className="w-full !py-1 text-xs"
        />
        <Button
          variant="secondary"
          onClick={handleAddMonster}
          disabled={locked || !newMonster.trim()}
          className="shrink-0 !px-2 !py-1 !text-[11px]"
        >
          <PlusIcon className="h-3 w-3" />
          Adicionar
        </Button>
      </div>
      {locked && (
        <GlassPanel className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg">
          <span className="text-xs text-gray-400">
            Pare o macro para editar ou adicionar monstros
          </span>
        </GlassPanel>
      )}
    </div>
  );

  return (
    <section
      aria-label="Configuração de ataque"
      className="rounded-lg border border-gray-700 bg-gray-800/50 p-3"
    >
      <header className="flex items-center justify-between gap-3 pb-3">
        <span title={enableTitle} className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onChange={updateAttackEnabled}
            disabled={enableDisabled}
            aria-label="Habilitar ataque"
          />
          <span className="text-xs font-medium text-gray-300">Habilitar ataque</span>
        </span>
        <Fieldset disabled={locked}>
          <Legend className="sr-only">Modo de ataque</Legend>
          <RadioGroup
            value={mode}
            onChange={updateAttackMode}
            aria-label="Modo de ataque"
            className="grid grid-cols-2 gap-0.5 rounded-md border border-gray-700 bg-gray-900/60 p-0.5"
          >
            {MODE_OPTIONS.map((opt) => (
              <Radio
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                title={opt.title}
                className="cursor-pointer rounded px-2 py-1 text-center text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-200 focus:outline-none data-[checked]:bg-gray-700 data-[checked]:text-gray-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[focus]:ring-1 data-[focus]:ring-accent-500"
              >
                {opt.label}
              </Radio>
            ))}
          </RadioGroup>
        </Fieldset>
      </header>

      <div className="grid grid-cols-2 items-stretch gap-x-8 gap-y-5">
        {mode === 'physical' ? (
          <TargetingCard targeting={targeting} disabled={locked} onChange={updateAttackTargeting} />
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <TargetingCard
              compact
              showAttackRange={false}
              targeting={targeting}
              disabled={locked}
              onChange={updateAttackTargeting}
            />
            <SkillRotationList
              slots={rotationSlots}
              activePriority={activePriority}
              disabled={locked}
              onSlotClick={setPickerPriority}
            />
          </div>
        )}
        <MonstersTable
          monsters={monsters}
          giveUpDefaultSec={giveUpTimeout}
          isRunning={locked}
          currentIndex={currentIndex}
          onRemove={handleRemoveMonster}
          onMove={handleMoveMonster}
          onGiveUpChange={handleGiveUpChange}
          addForm={monstersAddForm}
        />
        <GiveUpRule
          timeoutSec={giveUpTimeout}
          overrideCount={giveUpOverrideCount}
          onChange={(v) => updateAttackGiveUp({ timeoutSec: v })}
          disabled={locked}
          className="col-span-2"
        />
      </div>

      <SkillPickerModal
        isOpen={pickerPriority != null}
        priority={pickerPriority ?? 0}
        current={pickerPriority != null ? (rotationSlots[pickerPriority - 1]?.skill ?? null) : null}
        available={skillCatalog}
        disabledIds={rotationSlots
          .filter((s) => s.skill != null && s.priority !== pickerPriority)
          .map((s) => s.skill!.id)}
        onClose={() => setPickerPriority(null)}
        onConfirm={(skillId) => {
          if (pickerPriority == null) return;
          updateAttackRotationSlot(pickerPriority - 1, skillId == null ? null : { skillId });
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget != null}
        title="Remover monstro"
        message={`Remover monstro "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Remover"
        onConfirm={confirmRemoveMonster}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
};

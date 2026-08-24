import { Fieldset, Radio, RadioGroup } from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { type FC, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import {
  MISC_AUTO_GROUP_MAX_MEMBERS,
  VALIDATION_MSG,
  hasGroupMemberConflict,
  type AutoGroupMode,
} from '@shared/app-config';
import { EMPTY_MEMBERS, useAppConfigStore } from '../../../stores/app-config-store';
import { useGroupMemberNames } from '../../../lib/group-membership';
import { gameApi } from '../../../lib/game-api';
import { Button } from '../../shared/Button';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { TextInput } from '../../shared/TextInput';
import { MiscCard } from './MiscCard';
import { WhitelistTable, type WhitelistRow } from './WhitelistTable';

interface AutoGroupRowProps {
  disabled: boolean;
}

const MODE_OPTIONS: { value: AutoGroupMode; label: string }[] = [
  { value: 'leader', label: 'Líder do grupo' },
  { value: 'accept', label: 'Aceitar convites' },
];

const MODE_HELP: Record<AutoGroupMode, string> = {
  leader: 'Convida os jogadores da whitelist que estiverem por perto.',
  accept: 'Aceita convites de grupo dos jogadores da whitelist.',
};

export const AutoGroupRow: FC<AutoGroupRowProps> = ({ disabled }) => {
  const { autoGroup, updateMiscAutoGroup } = useAppConfigStore(
    useShallow((s) => ({
      autoGroup: s.config.misc?.autoGroup,
      updateMiscAutoGroup: s.updateMiscAutoGroup,
    })),
  );

  const enabled = autoGroup?.enabled ?? false;
  const mode: AutoGroupMode = autoGroup?.mode ?? 'leader';
  const whitelist = autoGroup?.whitelist ?? EMPTY_MEMBERS;

  const groupNames = useGroupMemberNames();
  // In-group members float to the top (stable sort keeps insertion order).
  const rows: WhitelistRow[] = whitelist
    .map((m) => ({ name: m.name, inGroup: groupNames.has(m.name.toLowerCase()) }))
    .sort((a, b) => Number(b.inGroup) - Number(a.inGroup));

  const atMax = whitelist.length >= MISC_AUTO_GROUP_MAX_MEMBERS;

  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState<{ name: string } | null>(null);
  // A pending mode change that requires leaving the current party first.
  const [modeConfirm, setModeConfirm] = useState<AutoGroupMode | null>(null);

  const handleAdd = (): void => {
    const name = newName.trim();
    if (!name) return;
    if (hasGroupMemberConflict(whitelist, name)) {
      toast.error(VALIDATION_MSG.duplicateGroupMember);
      return;
    }
    updateMiscAutoGroup({ whitelist: [...whitelist, { name }] });
    setNewName('');
  };

  const confirmRemove = (): void => {
    if (confirm) {
      // Match by name — the sorted row index differs from the whitelist index.
      const target = confirm.name.toLowerCase();
      updateMiscAutoGroup({
        whitelist: whitelist.filter((m) => m.name.toLowerCase() !== target),
      });
    }
    setConfirm(null);
  };

  const addForm = (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <TextInput
        compact
        value={newName}
        onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder="Nome do jogador"
        aria-label="Nome do jogador"
        disabled={disabled || atMax}
        className="w-full !py-1 text-xs"
      />
      <Button
        variant="secondary"
        onClick={handleAdd}
        disabled={disabled || atMax || !newName.trim()}
        title={atMax ? `Máximo de ${MISC_AUTO_GROUP_MAX_MEMBERS} jogadores` : undefined}
        className="shrink-0 !px-2 !py-1 !text-[11px]"
      >
        <PlusIcon className="h-3 w-3" />
        Adicionar
      </Button>
    </div>
  );

  return (
    <MiscCard
      title="Auto Grupo"
      description="Forma grupo automaticamente com jogadores da whitelist."
      enabled={enabled}
      onToggle={(v) => updateMiscAutoGroup({ enabled: v })}
      disabled={disabled}
      kind="always-on"
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-[11px] font-medium tracking-wider text-gray-500 uppercase">
            Comportamento
          </div>
          <Fieldset disabled={disabled}>
            <RadioGroup
              value={mode}
              onChange={(m) =>
                groupNames.size > 0 && m !== mode
                  ? setModeConfirm(m)
                  : updateMiscAutoGroup({ mode: m })
              }
              className="grid grid-cols-2 gap-1 rounded-md border border-gray-700 bg-gray-900/60 p-1"
            >
              {MODE_OPTIONS.map((opt) => (
                <Radio
                  key={opt.value}
                  value={opt.value}
                  className="cursor-pointer rounded px-2 py-1.5 text-center text-xs font-medium text-gray-400 transition-colors hover:text-gray-200 focus:outline-none data-[checked]:bg-gray-700 data-[checked]:text-gray-100 data-[focus]:ring-1 data-[focus]:ring-accent-500"
                >
                  {opt.label}
                </Radio>
              ))}
            </RadioGroup>
          </Fieldset>
          <p className="mt-2 text-[11px] text-gray-500">{MODE_HELP[mode]}</p>
        </div>

        <WhitelistTable
          rows={rows}
          disabled={disabled}
          onRequestRemove={(name) => setConfirm({ name })}
          addForm={addForm}
        />
      </div>

      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.name ?? ''}"?`}
        message="Esse jogador sai da whitelist do Auto Grupo. Você pode adicioná-lo novamente depois."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        isOpen={modeConfirm != null}
        title="Sair do grupo?"
        message="Você está em um grupo. Trocar o modo vai fazer você sair. Continuar?"
        confirmLabel="Sair e trocar"
        onCancel={() => setModeConfirm(null)}
        onConfirm={() => {
          if (modeConfirm) {
            gameApi.partyLeave();
            updateMiscAutoGroup({ mode: modeConfirm });
          }
          setModeConfirm(null);
        }}
      />
    </MiscCard>
  );
};

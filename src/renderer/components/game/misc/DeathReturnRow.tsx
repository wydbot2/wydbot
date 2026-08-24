import { Fieldset, Radio, RadioGroup } from '@headlessui/react';
import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DeathReturnMode } from '@shared/app-config';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { MiscCard } from './MiscCard';

interface DeathReturnRowProps {
  disabled: boolean;
}

const DEATH_MODES = [
  { value: 'continue', label: 'Continuar' },
  { value: 'pause', label: 'Pausar' },
  { value: 'stop', label: 'Parar' },
  { value: 'restart', label: 'Reiniciar' },
] as const;

const DEATH_MODE_HELP: Record<DeathReturnMode, string> = {
  continue: 'O macro segue executando depois da morte.',
  pause: 'O macro fica pausado. Use Play para retomar.',
  stop: 'O macro encerra. Precisa ser iniciado de novo.',
  restart: 'O macro reinicia automaticamente do passo 1.',
};

export const DeathReturnRow: FC<DeathReturnRowProps> = ({ disabled }) => {
  const { deathReturn, updateMiscDeathReturn } = useAppConfigStore(
    useShallow((s) => ({
      deathReturn: s.config.misc?.deathReturn,
      updateMiscDeathReturn: s.updateMiscDeathReturn,
    })),
  );

  const enabled = deathReturn?.enabled ?? false;
  const mode = deathReturn?.mode ?? 'continue';

  return (
    <MiscCard
      title="Voltar à cidade após morte"
      description="Personagem retorna automaticamente para a cidade ao morrer."
      enabled={enabled}
      onToggle={(v) => updateMiscDeathReturn({ enabled: v })}
      disabled={disabled}
      kind="lifecycle-controller"
    >
      <div className="max-w-md">
        <div className="mb-1.5 text-[11px] font-medium tracking-wider text-gray-500 uppercase">
          Macro após a morte
        </div>
        <Fieldset disabled={disabled}>
          <RadioGroup
            value={mode}
            onChange={(m) => updateMiscDeathReturn({ mode: m })}
            className="grid grid-cols-4 gap-1 rounded-md border border-gray-700 bg-gray-900/60 p-1"
          >
            {DEATH_MODES.map((opt) => (
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
        <p className="mt-2 text-[11px] text-gray-500">{DEATH_MODE_HELP[mode]}</p>
      </div>
    </MiscCard>
  );
};

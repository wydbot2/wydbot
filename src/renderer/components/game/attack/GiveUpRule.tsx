import { type FC } from 'react';
import { MAX_GIVEUP_TIMEOUT_SEC, MIN_GIVEUP_TIMEOUT_SEC } from '@shared/constants/attack';
import { AccentCard } from '../../shared/AccentCard';
import { NumberInput } from '../../shared/NumberInput';

interface GiveUpRuleProps {
  timeoutSec: number;
  overrideCount: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  className?: string;
}

export const GiveUpRule: FC<GiveUpRuleProps> = ({
  timeoutSec,
  overrideCount,
  onChange,
  disabled,
  className = '',
}) => (
  <div className={`flex flex-col ${className}`}>
    <h3 className="pp-section-title mb-2.5">Desistência padrão</h3>
    <AccentCard variant="bar" accent="var(--color-yellow-400)">
      <div className="flex flex-wrap items-center gap-2 pl-2.5 text-xs text-gray-300">
        <span>Se o alvo continuar vivo após</span>
        <NumberInput
          value={timeoutSec}
          min={MIN_GIVEUP_TIMEOUT_SEC}
          max={MAX_GIVEUP_TIMEOUT_SEC}
          onChange={onChange}
          disabled={disabled}
          ariaLabel="Tempo limite padrão em segundos"
        />
        <span>segundos atacando, pula para o próximo monstro.</span>
        <span className="text-gray-500">
          {overrideCount === 0
            ? 'Vale para todos os monstros — personalize na coluna "Desistência".'
            : overrideCount === 1
              ? '1 monstro tem tempo próprio — os demais herdam este padrão.'
              : `${overrideCount} monstros têm tempo próprio — os demais herdam este padrão.`}
        </span>
      </div>
    </AccentCard>
  </div>
);

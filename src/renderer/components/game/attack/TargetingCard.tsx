import { type FC, type ReactNode } from 'react';
import type { AttackTargeting } from '@shared/app-config';
import {
  DEFAULT_ATTACK_RANGE,
  MAX_ATTACK_RANGE,
  MAX_DETECTION_RADIUS,
  MIN_ATTACK_RANGE,
  MIN_DETECTION_RADIUS,
} from '@shared/constants/attack';
import { NumberInput } from '../../shared/NumberInput';

interface TargetingRowProps {
  title: string;
  hint: string;
  lastRow?: boolean;
  children: ReactNode;
}

const TargetingRow: FC<TargetingRowProps> = ({ title, hint, lastRow, children }) => (
  <div
    className={`flex items-center justify-between gap-3 px-3 py-2.5 ${lastRow ? '' : 'border-b border-gray-800'}`}
  >
    <div className="flex flex-col">
      <span className="text-xs text-gray-300">{title}</span>
      <span className="text-[11px] text-gray-500">{hint}</span>
    </div>
    {children}
  </div>
);

interface TargetingCardProps {
  targeting: AttackTargeting;
  disabled?: boolean;
  onChange: (patch: Partial<AttackTargeting>) => void;
  /** Drops the fixed height for stacked layouts. */
  compact?: boolean;
  /** Hidden for magical mode — range is derived per-skill from castRange. */
  showAttackRange?: boolean;
}

export const TargetingCard: FC<TargetingCardProps> = ({
  targeting,
  disabled,
  onChange,
  compact,
  showAttackRange = true,
}) => (
  <div className={compact ? 'flex flex-col' : 'flex h-full flex-col'}>
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 ${compact ? '' : 'flex-1'}`}
    >
      <TargetingRow
        title="Raio de detecção"
        hint="tiles ao redor para detectar monstros"
        lastRow={!showAttackRange}
      >
        <NumberInput
          value={targeting.detectionRadius}
          min={MIN_DETECTION_RADIUS}
          max={MAX_DETECTION_RADIUS}
          onChange={(v) => onChange({ detectionRadius: v })}
          disabled={disabled}
          ariaLabel="Raio de detecção em tiles"
        />
      </TargetingRow>
      {showAttackRange && (
        <TargetingRow
          title="Alcance de ataque"
          hint="tiles em que ainda consegue acertar (1 = melee adjacente)"
          lastRow
        >
          <NumberInput
            value={targeting.attackRange ?? DEFAULT_ATTACK_RANGE}
            min={MIN_ATTACK_RANGE}
            max={MAX_ATTACK_RANGE}
            onChange={(v) => onChange({ attackRange: v })}
            disabled={disabled}
            ariaLabel="Alcance de ataque em tiles"
          />
        </TargetingRow>
      )}
    </div>
  </div>
);

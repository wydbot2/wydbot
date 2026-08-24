import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { MiscCard } from './MiscCard';
import { HealRuleRow } from './HealRuleRow';

interface AutoHealingRowProps {
  disabled: boolean;
}

/**
 * Auto Healing — inline rule row.
 *
 * One MiscCard with 4 inline rule lines (HP / MP / Montaria / Debuff). Master
 * toggle in the card header collapses children when OFF. Each rule line is
 * rendered by `HealRuleRow` (Switch + label + threshold + chips + add).
 */
export const AutoHealingRow: FC<AutoHealingRowProps> = ({ disabled }) => {
  const { enabled, updateMaster } = useAppConfigStore(
    useShallow((s) => ({
      enabled: s.config.misc?.autoHealing?.enabled ?? false,
      updateMaster: s.updateMiscAutoHealingMaster,
    })),
  );

  return (
    <MiscCard
      title="Auto Healing"
      description="Recupera HP/MP, alimenta a montaria e cura debuffs durante o macro."
      kind="macro-coupled"
      enabled={enabled}
      onToggle={(v) => updateMaster({ enabled: v })}
      disabled={disabled}
    >
      <HealRuleRow kind="hp" disabled={disabled} />
      <HealRuleRow kind="mp" disabled={disabled} />
      <HealRuleRow kind="mount" disabled={disabled} />
      <HealRuleRow kind="debuff" disabled={disabled} />
    </MiscCard>
  );
};

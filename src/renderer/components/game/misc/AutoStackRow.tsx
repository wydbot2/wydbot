import type { FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { MiscCard } from './MiscCard';

interface AutoStackRowProps {
  disabled: boolean;
}

export const AutoStackRow: FC<AutoStackRowProps> = ({ disabled }) => {
  const { autoStack, updateMiscAutoStack } = useAppConfigStore(
    useShallow((s) => ({
      autoStack: s.config.misc?.autoStack,
      updateMiscAutoStack: s.updateMiscAutoStack,
    })),
  );
  const enabled = autoStack?.enabled ?? false;
  return (
    <MiscCard
      title="Agrupamento de itens"
      description="Junta automaticamente pilhas parciais do mesmo item na mochila."
      kind="always-on"
      enabled={enabled}
      onToggle={(v) => updateMiscAutoStack({ enabled: v })}
      disabled={disabled}
    />
  );
};

import { type FC } from 'react';
import { useMacroLifecycleStore } from '../../../stores/macro-lifecycle-store';
import { MacroStatus } from '../../../stores/macro-status';
import { pauseMacro } from '../../../lib/macro-engine';
import { ReconnectRow } from './ReconnectRow';
import { DeathReturnRow } from './DeathReturnRow';
import { AutoStackRow } from './AutoStackRow';
import { AutoBuffRow } from './AutoBuffRow';
import { AutoSummonRow } from './AutoSummonRow';
import { AutoDropRow } from './AutoDropRow';
import { AutoHealingRow } from './AutoHealingRow';
import { AutoGroupRow } from './AutoGroupRow';
import { LockBanner } from './LockBanner';

export const MiscPanel: FC = () => {
  const macroStatus = useMacroLifecycleStore((s) => s.status);
  const locked = macroStatus === MacroStatus.Running;

  return (
    <LockBanner locked={locked} onPause={() => pauseMacro()}>
      <div className="flex flex-col gap-2">
        <ReconnectRow disabled={locked} />
        <DeathReturnRow disabled={locked} />
        <AutoStackRow disabled={locked} />
        <AutoBuffRow disabled={locked} />
        <AutoSummonRow disabled={locked} />
        <AutoDropRow disabled={locked} />
        <AutoHealingRow disabled={locked} />
        <AutoGroupRow disabled={locked} />
      </div>
    </LockBanner>
  );
};

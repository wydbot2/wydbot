import { useEffect, useState } from 'react';
import type { AttackGiveUpReason, MacroEvent } from '../lib/macro-events';
import { onMacroEvent } from '../lib/macro-events';

export type MacroAction =
  | { kind: 'walking' }
  | { kind: 'engaging'; targetName: string | null }
  | { kind: 'attacking'; targetName: string | null }
  | { kind: 'returning'; targetName: string | null }
  | { kind: 'givingUp'; targetName: string; reason: AttackGiveUpReason };

export const reduceMacroAction = (prev: MacroAction | null, e: MacroEvent): MacroAction | null => {
  switch (e.kind) {
    case 'walkStarted':
      // Combat phase outranks walking; engine pauses walks during combat.
      return prev && prev.kind !== 'walking' ? prev : { kind: 'walking' };
    case 'walkResolved':
    case 'walkAborted':
      return prev?.kind === 'walking' ? null : prev;
    case 'attackPhaseChanged':
      // givingUp is sticky until combatEnded.
      if (prev?.kind === 'givingUp') return prev;
      return { kind: e.phase, targetName: e.targetName };
    case 'attackGaveUp':
      return { kind: 'givingUp', targetName: e.targetName, reason: e.reason };
    case 'combatEnded':
      return null;
    default:
      return prev;
  }
};

export const useCurrentMacroAction = (): MacroAction | null => {
  const [action, setAction] = useState<MacroAction | null>(null);
  useEffect(() => {
    return onMacroEvent((e) => {
      setAction((prev) => reduceMacroAction(prev, e));
    });
  }, []);
  return action;
};

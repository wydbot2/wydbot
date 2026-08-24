import { useEffect, useState } from 'react';
import { onMacroEvent } from '../lib/macro-events';

export const useAttackTarget = (): string | null => {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    return onMacroEvent((e) => {
      if (e.kind === 'targetChanged') setName(e.name);
    });
  }, []);
  return name;
};

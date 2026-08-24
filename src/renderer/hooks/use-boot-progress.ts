import { useEffect, useState } from 'react';
import type { IpcBootProgress } from '@shared/ipc/ipc-api';
import { getWydAPI } from '../lib/electron-api';

const INITIAL: IpcBootProgress = {
  stage: 'window-create',
  stageIndex: 0,
  stageCount: 5,
  percent: 0,
  label: 'Iniciando…',
};

export const useBootProgress = (): IpcBootProgress => {
  const [state, setState] = useState<IpcBootProgress>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: IpcBootProgress | null): void => {
      if (cancelled || !next) return;
      setState((prev) => {
        // Terminal/guided states bypass the monotonic-percent rule.
        if (next.stage === 'error' || prev.stage === 'error') {
          return next;
        }
        return next.percent >= prev.percent ? next : prev;
      });
    };
    const off = getWydAPI()?.onBootProgress(apply);
    getWydAPI()
      ?.getBootProgressSnapshot()
      .then(apply)
      .catch(() => {});
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  return state;
};

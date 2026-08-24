import type { IpcMobDeath } from '@shared/ipc/ipc-api';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { getWydAPI } from './electron-api';
import { logMacro } from './macro-log';
import { pauseMacro, registerAmbientModule, startMacro, stopMacro } from './macro-engine';
import { useMacroLifecycleStore } from '../stores/macro-lifecycle-store';
import { MacroStatus } from '../stores/macro-status';

let unsubMobDeath: (() => void) | null = null;

const dispatchMode = (): void => {
  const mode = useAppConfigStore.getState().config.misc?.deathReturn?.mode;
  if (!mode) return;

  switch (mode) {
    case 'continue':
      return;
    case 'pause':
      pauseMacro('Personagem morreu');
      return;
    case 'stop':
      logMacro('info', '→ parando macro');
      stopMacro();
      return;
    case 'restart':
      logMacro('info', '→ reiniciando macro do passo 1');
      stopMacro();
      startMacro(0);
      return;
  }
};

const onMobDeath = (data: IpcMobDeath): void => {
  if (data.killed !== usePlayerStore.getState().mobIndex) return;
  if (useMacroLifecycleStore.getState().status !== MacroStatus.Running) return;

  if (useAppConfigStore.getState().config.misc?.deathReturn?.enabled) {
    logMacro('info', 'Personagem morreu — enviando respawn');
    gameApi.respawn();
  }
  dispatchMode();
};

const mountListener = (): void => {
  if (unsubMobDeath !== null) return;
  const api = getWydAPI();
  if (!api) return;
  unsubMobDeath = api.onMobDeath(onMobDeath);
};

registerAmbientModule({
  name: 'death-respawn',
  // Watchdog cadence — listener is push-driven; tick only re-mounts if dropped.
  pollIntervalMs: 60_000,
  lifecycle: 'lifecycle-controller',

  tick: async (signal) => {
    if (signal.aborted) return;
    mountListener();
  },

  reset: () => {
    unsubMobDeath?.();
    unsubMobDeath = null;
  },
});

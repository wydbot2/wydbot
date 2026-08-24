import { powerSaveBlocker } from 'electron';
import { platformLogger } from '../logging';

let blockerId: number | null = null;

export const startSleepPrevention = (): void => {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) return;
  blockerId = powerSaveBlocker.start('prevent-display-sleep');
  platformLogger.info(`[sleep] blocker active (id=${blockerId}, type=prevent-display-sleep)`);
};

export const stopSleepPrevention = (): void => {
  if (blockerId === null) return;
  const id = blockerId;
  blockerId = null;
  if (powerSaveBlocker.isStarted(id)) {
    powerSaveBlocker.stop(id);
    platformLogger.info(`[sleep] blocker released (id=${id})`);
  }
};

import type { AppConfigV1 } from '@shared/app-config';
import { useAppConfigStore } from '../stores/app-config-store';
import {
  isMagicalAttackAmbientEnabled,
  isPhysicalAttackAmbientEnabled,
} from './ambient-module-flags';
import {
  isAmbientModuleRunning,
  isSuspendedModule,
  resumeSuspendedModule,
  suspendAmbientModule,
} from './macro-engine';
import { logMacro } from './macro-log';

const ATTACK_MODULE_NAMES = ['attack-physical', 'attack-magical'] as const;

const enabledAttackModuleName = (config: AppConfigV1): string | null => {
  if (isPhysicalAttackAmbientEnabled(config)) return 'attack-physical';
  if (isMagicalAttackAmbientEnabled(config)) return 'attack-magical';
  return null;
};

/** Script-facing control for the attack ambient module (physical or magical, per config mode). */
export const attackScriptControl = {
  /** Suspend both attack modules (no state reset); restarts stay blocked until `start()`/`stopMacro`. */
  pause(): void {
    let wasRunning = false;
    for (const name of ATTACK_MODULE_NAMES) {
      if (isAmbientModuleRunning(name)) wasRunning = true;
      suspendAmbientModule(name);
    }
    if (wasRunning) logMacro('info', '[script] ataque pausado');
  },

  /** Resume the attack module the config enables (idempotent). */
  start(): void {
    const name = enabledAttackModuleName(useAppConfigStore.getState().config);
    if (!name) return;
    if (isSuspendedModule(name)) logMacro('info', '[script] ataque retomado');
    resumeSuspendedModule(name);
  },

  status(): 'running' | 'paused' | 'disabled' {
    const name = enabledAttackModuleName(useAppConfigStore.getState().config);
    if (!name) return 'disabled';
    if (isAmbientModuleRunning(name)) return 'running';
    return 'paused';
  },
};

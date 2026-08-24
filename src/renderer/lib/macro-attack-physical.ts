import { ATTACK_CADENCE_MS, DEFAULT_ATTACK_RANGE } from '@shared/constants/attack';
import { useAppConfigStore } from '../stores/app-config-store';
import { gameApi } from './game-api';
import { registerAmbientModule } from './macro-engine';
import { createAttackEngagement, type AttackPolicy, type Target } from './macro-attack-engagement';

let lastAttackAt = 0;

const physicalPolicy: AttackPolicy = {
  name: 'attack-physical',
  mode: 'physical',
  // Weapon range — the user-configured attackRange (no per-skill data for a basic attack).
  getRange: (): number =>
    useAppConfigStore.getState().config.attack?.targeting?.attackRange ?? DEFAULT_ATTACK_RANGE,
  executeAttack: (target: Target): void => {
    if (Date.now() - lastAttackAt < ATTACK_CADENCE_MS) return;
    gameApi.attack(target.index, target.pos, 0);
    lastAttackAt = Date.now();
  },
  reset: (): void => {
    lastAttackAt = 0;
  },
};

registerAmbientModule(createAttackEngagement(physicalPolicy));

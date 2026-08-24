import { useAppConfigStore } from '../stores/app-config-store';
import {
  autoDropResyncKey,
  isAutoBuffAmbientEnabled,
  isAutoDropEnabled,
  isAutoGroupEnabled,
  isAutoStackEnabled,
  isAutoSummonAmbientEnabled,
  isDeathRespawnEnabled,
  isMagicalAttackAmbientEnabled,
  isPhysicalAttackAmbientEnabled,
} from '../lib/ambient-module-flags';
import { startAmbientModule, stopAmbientModule } from '../lib/macro-engine';
// Side-effect: registers the `death-respawn` module.
import '../lib/macro-death-respawn';
// Side-effect: registers the `attack-physical` module.
import '../lib/macro-attack-physical';
// Side-effect: registers the `attack-magical` module.
import '../lib/macro-attack-magical';
// Side-effect: registers the `auto-stack` module.
import '../lib/macro-auto-stack';
// Side-effect: registers the `auto-buff` module.
import '../lib/macro-auto-buff';
// Side-effect: registers the `auto-summon` module.
import '../lib/macro-auto-summon';
// Side-effect: registers the `auto-drop` module.
import '../lib/macro-auto-drop';
// Side-effect: registers the `auto-group` module.
import '../lib/macro-auto-group';
// Side-effect: registers the `auto-mount-feed` module.
import '../lib/macro-auto-mount-feed';
// Side-effect: registers the `auto-hp` module.
import '../lib/macro-auto-hp';
// Side-effect: registers the `auto-mp` module.
import '../lib/macro-auto-mp';
// Side-effect: registers the `auto-debuff-cure` module.
import '../lib/macro-auto-debuff-cure';
// Side-effect: registers the `entity-ttl-cull` module.
import '../lib/macro-entity-ttl-cull';

const setAmbientEnabled = (name: string, enabled: boolean): void => {
  if (enabled) startAmbientModule(name);
  else stopAmbientModule(name);
};

/** Idempotent start/stop from current app-config (post-halt re-arm). */
export const resyncAmbientModulesFromConfig = (): void => {
  const { config } = useAppConfigStore.getState();
  setAmbientEnabled('death-respawn', isDeathRespawnEnabled(config));
  setAmbientEnabled('attack-physical', isPhysicalAttackAmbientEnabled(config));
  setAmbientEnabled('attack-magical', isMagicalAttackAmbientEnabled(config));
  setAmbientEnabled('auto-stack', isAutoStackEnabled(config));
  setAmbientEnabled('auto-buff', isAutoBuffAmbientEnabled(config));
  setAmbientEnabled('auto-summon', isAutoSummonAmbientEnabled(config));
  // Same stop→start contract as the baselineHash subscription below.
  stopAmbientModule('auto-drop');
  if (isAutoDropEnabled(config)) startAmbientModule('auto-drop');
  setAmbientEnabled('auto-group', isAutoGroupEnabled(config));
  startAmbientModule('entity-ttl-cull');
};

export const setupAmbientModulesBridge = (): (() => void)[] => {
  const unsubs: (() => void)[] = [];

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isDeathRespawnEnabled(s.config),
      (shouldRun) => setAmbientEnabled('death-respawn', shouldRun),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('death-respawn'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isPhysicalAttackAmbientEnabled(s.config),
      (shouldRun) => setAmbientEnabled('attack-physical', shouldRun),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('attack-physical'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isMagicalAttackAmbientEnabled(s.config),
      (shouldRun) => setAmbientEnabled('attack-magical', shouldRun),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('attack-magical'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isAutoStackEnabled(s.config),
      (enabled) => setAmbientEnabled('auto-stack', enabled),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('auto-stack'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isAutoBuffAmbientEnabled(s.config),
      (shouldRun) => setAmbientEnabled('auto-buff', shouldRun),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('auto-buff'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isAutoSummonAmbientEnabled(s.config),
      (shouldRun) => setAmbientEnabled('auto-summon', shouldRun),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('auto-summon'));

  // baselineHash key forces stop→start on config load (enabled boolean alone is a no-op).
  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => autoDropResyncKey(s.config, s.baselineHash),
      (key) => {
        stopAmbientModule('auto-drop');
        if (key !== null) startAmbientModule('auto-drop');
      },
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('auto-drop'));

  unsubs.push(
    useAppConfigStore.subscribe(
      (s) => isAutoGroupEnabled(s.config),
      (enabled) => setAmbientEnabled('auto-group', enabled),
      { fireImmediately: true },
    ),
  );
  unsubs.push(() => stopAmbientModule('auto-group'));

  startAmbientModule('entity-ttl-cull');
  unsubs.push(() => stopAmbientModule('entity-ttl-cull'));

  return unsubs;
};

/**
 * Pure predicates: app-config → which ambient modules should be running.
 * Shared by the config subscription bridge and post-halt resync so flags cannot drift.
 */
import type { AppConfigV1 } from '@shared/app-config';

export const isDeathRespawnEnabled = (config: AppConfigV1): boolean => {
  const deathReturn = config.misc?.deathReturn;
  return Boolean(deathReturn?.enabled || (deathReturn?.mode && deathReturn.mode !== 'continue'));
};

export const isPhysicalAttackAmbientEnabled = (config: AppConfigV1): boolean => {
  const attack = config.attack;
  const mode = attack?.mode ?? 'physical';
  return Boolean(attack?.enabled && mode === 'physical' && (attack?.monsters?.length ?? 0) > 0);
};

export const isMagicalAttackAmbientEnabled = (config: AppConfigV1): boolean => {
  const attack = config.attack;
  const mode = attack?.mode ?? 'physical';
  return Boolean(attack?.enabled && mode === 'magical' && (attack?.monsters?.length ?? 0) > 0);
};

export const isAutoStackEnabled = (config: AppConfigV1): boolean =>
  config.misc?.autoStack?.enabled ?? false;

export const isAutoBuffAmbientEnabled = (config: AppConfigV1): boolean =>
  Boolean(config.misc?.autoBuff?.enabled && (config.misc.autoBuff.skills.length ?? 0) > 0);

export const isAutoSummonAmbientEnabled = (config: AppConfigV1): boolean =>
  Boolean(config.misc?.autoSummon?.enabled && config.misc.autoSummon.skill != null);

export const isAutoDropEnabled = (config: AppConfigV1): boolean =>
  config.misc?.autoDrop?.enabled ?? false;

export const isAutoGroupEnabled = (config: AppConfigV1): boolean =>
  config.misc?.autoGroup?.enabled ?? false;

/**
 * Subscribe key for auto-drop: `null` when disabled; otherwise `baselineHash` so a
 * config load restarts the module and re-primes against the loaded blacklist.
 */
export const autoDropResyncKey = (
  config: AppConfigV1,
  baselineHash: string | null | undefined,
): string | null => (isAutoDropEnabled(config) ? (baselineHash ?? null) : null);

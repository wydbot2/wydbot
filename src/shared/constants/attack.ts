/**
 * Constants for the `attack-physical` ambient module.
 *
 * `ATTACK_CADENCE_MS` mirrors the canonical outbound `0x39D` packet gate.
 * The `[230, 340] ms` clamp is the renderer interpolation window.
 */

export const LEASH_TILES = 18;

export const MIN_DETECTION_RADIUS = 1;
export const MAX_DETECTION_RADIUS = 12;
export const DEFAULT_DETECTION_RADIUS = 6;

export const MIN_ATTACK_RANGE = 1;
export const MAX_ATTACK_RANGE = 12;
export const DEFAULT_ATTACK_RANGE = 1;

export const MIN_GIVEUP_TIMEOUT_SEC = 15;
export const MAX_GIVEUP_TIMEOUT_SEC = 120;
export const DEFAULT_GIVEUP_TIMEOUT_SEC = 30;

export const ATTACK_CADENCE_MS = 1000;
export const ATTACK_QUEUE_COOLDOWN_MS = 1000;
export const COMBAT_RECHECK_MS = 250;
export const ATTACK_POLL_INTERVAL_MS = 250;

export const GIVEUP_IGNORE_TTL_MS = 60_000;

/** Extra rings past attack range the approach picker searches for a LoS-clear tile (see pickAttackTileAround). */
export const ATTACK_LOS_ACQUIRE_MAX_EXTRA = 4;

export const ROTATION_SLOT_COUNT = 4;

export const MAGICAL_INTER_CAST_DELAY_MS = 1000;

/** Skill types above this threshold are remapped (+0x5F) before being written to the wire. */
export const SKILL_TYPE_REMAP_THRESHOLD = 0x68;
export const SKILL_TYPE_REMAP_OFFSET = 0x5f;

import type { MobName, MPosition, MScore } from './game-structures';
import type { MItem } from './item-types';
import type { DirectionCode } from '../ipc/walkability';

/**
 * One in-flight server-announced move leg for a remote entity (`0x36C`).
 * The live position is projected from this leg (see `entity-position.ts`)
 * instead of snapping the store to `dst` on packet arrival.
 */
export interface EntityMoveLeg {
  /** Server-confirmed origin tile (packet `lastPosition`) — also the store anchor. */
  src: MPosition;
  dst: MPosition;
  /** Empty → straight Chebyshev line. */
  codes: readonly DirectionCode[];
  speedMove: number;
  /** `Date.now()` at packet receipt — the interpolation clock. */
  startMs: number;
}

/**
 * Entity classification baked by the main process before crossing the IPC
 * boundary. Renderer reads `entity.category` directly; never re-derives.
 *
 * `'player_self'` is the local player and never crosses to `entities[]` —
 * the IPC transform drops it; player state comes from `usePlayerStore` via
 * `CharToWorld`. The three remaining values are the discriminants of `Entity`.
 */
export type EntityCategory = 'player_self' | 'player_other' | 'npc' | 'monster';

/**
 * Discriminated union of typed entities baked main-side at the IPC transform.
 * Variants carry only the fields each category needs; wire residue used by
 * the discriminator (`mobClassNibble`, `actionType`, `tab`) is dropped after
 * the bake. `affects` is intentionally NOT carried — the local player gets
 * affects via `CharToWorld`; remote entities have no current consumer.
 */
export interface BaseEntity {
  index: number;
  name: string;
  /**
   * Last server-confirmed tile (spawn or leg origin). The LIVE position of a
   * walking entity is projected by `getEntityLivePosition` — read that for
   * gameplay decisions, not this field directly.
   */
  position: MPosition;
  /** In-flight move leg (`0x36C` walk broadcast). Read via `getEntityLivePosition`. */
  moveLeg?: EntityMoveLeg | null;
  /**
   * Liveness flag. Set by `0x338 MobDeath` and by `0x165` `state >= 1`.
   * Cleared on slot reuse (next `0x364 CreateMob` with the same index)
   * or by `0x36A subType==2` (revive). Mirrors the canonical client liveness byte.
   * `undefined` = alive.
   */
  isDead?: boolean;
  /**
   * Last observed `0x165` state values while the entity remains in store.
   * Mirrors the canonical client death-state byte:
   *   - `0` — primed (AOI leave / re-notify after first `0x165 state=0`)
   *   - `1` — dying (first `0x165 state=1`; fade timer running)
   *   - `2` — fade (first `0x165 state=2`; FX visible)
   *   - `null` / unset — virgin slot (canonical value `-1`), never received `0x165`
   * Wire `>= 3` (hard evict) removes immediately and never lands here.
   * Second `0x165` of any state while `deathState ∈ {0, 2}` evicts
   */
  deathState?: 0 | 1 | 2 | null;
  /**
   * `Date.now()` at the moment the entity first transitioned into `deathState >= 1`
   * (or when `0x338` arrived first). Mirrors the canonical client death timestamp. Consumed by
   * `entity-ttl-cull` (corpse drop after ~10 s).
   */
  deathTickMs?: number | null;
  /**
   * `Date.now()` of the last server-confirmed touch (create / move / HP / 0x36A /
   * 0x36B / death). Compared against `usePlayerStore.lastTeleportMs` only —
   * no absolute age gate (design D1). Pre-teleport residues are stale until
   * the server reconfirms the slot.
   */
  lastSeenMs?: number;
}

/** NPC service category, resolved from a name→category map; drives the macro interact flow. */
export type NpcCategory =
  | 'bank'
  | 'shop'
  | 'learn'
  | 'menupopup'
  | 'portal'
  | 'compose'
  | 'unknown';

export interface NpcEntity extends BaseEntity {
  category: 'npc';
  /** Wire service hint from CreateMob (chip/probe order); not interact SoT. */
  npcCategory: NpcCategory;
  /** Compose-menu root group (entity+0x750); selects which Item-Mix subtree to show. */
  composeRoot?: number;
  /** Visible-model ids from CreateMob; index = equip slot (0=body, 1..15=gear), 0 = empty. */
  equipModelIds: number[];
}

export interface MonsterEntity extends BaseEntity {
  category: 'monster';
  score: MScore;
  /** Visible-model ids from CreateMob; index = equip slot (0=body, 1..15=gear), 0 = empty. */
  equipModelIds: number[];
}

export interface OtherPlayerEntity extends BaseEntity {
  category: 'player_other';
  score: MScore;
  guildIndex: number;
}

export type Entity = NpcEntity | MonsterEntity | OtherPlayerEntity;

export interface ViewEquipSummary {
  /** Full per-slot MItem (index + effects) — lets the char-select preview show icons + refine. */
  items: MItem[];
}

export interface ViewSelChar {
  posX: number[];
  posY: number[];
  names: MobName[];
  scores: MScore[];
  equips: ViewEquipSummary[];
  /** Per-character TransformId (morph visual id; 0 = none). */
  transformIds: number[];
  guilds: number[];
  coins: number[];
  exps: number[];
}

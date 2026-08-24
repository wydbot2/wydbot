/**
 * Skill / weapon-type stat row from `SkillData.bin` (248 fixed slots × 0x68 stride).
 *
 * Indexed by:
 *   - WTYPE effect (`MItemDefinition.WTYPE`) of an item, OR
 *   - derived weapon category from item id (5000..5104, 5400..5447 — see
 *     `skill-stats.ts`).
 *
 * Per Only 4 fields
 * (`baseHitrate`, `weaponStatType`, `baseDamage`, `auxDamage`) are consumed at
 * runtime today by the tooltip-render path; the rest are preserved for
 *
 * `entryId` is a sentinel set by the canonical loader as `recordIndex + 1`;
 * `entryId === 0` indicates an unused slot.
 */
export interface SkillRow {
  readonly id: number;
  /**
   * In-memory: absolute address of the skill name C-string in WYD.exe virtual space.
   * Not useful for offline parsing — the actual string lives in the exe at this fixed address.
   */
  readonly namePtr: number;
  /**
   *   0 or 2 → normal targeted
   *   3 or 4 → circular / box AoE scan
   *   5       → horizontal line scan
   *   6       → special AoE
   */
  readonly aoeModeKind: number;
  readonly baseHitrate: number;
  /**
   *   gate: `cooldownSecs * 1000 + lastCastTime <= now && lastCastTime + 1000 <= now`
   * Reduced by 1 when player level bucket > 8, and again if mount flag is set (min 1).
   * Distinct from `cooldownMultiplier` — that drives the auto-combat rotation loop.
   */
  readonly cooldownSecs: number;
  /**
   * finds the nearest enemy within this tile radius. Adjusted +5 when CCMode != 2.
   */
  readonly castRange: number;
  readonly weaponStatType: number;
  readonly baseDamage: number;
  /**
   * Keyboard/CCMode-3 cast eligibility gate A (u32 @ offset 0x1C). See `field9` for full notes.
   */
  readonly field7: number;
  /** Reserved / unused (u32 @ offset 0x20). No client-side xrefs found. */
  readonly field8: number;
  /**
   * Keyboard/CCMode-3 cast eligibility gate B (u32 @ offset 0x24).
   */
  readonly field9: number;
  readonly auxDamage: number;
  /**
   * Cooldown delay multiplier for auto-combat rotation (u32 @ offset 0x2C).
   *   `delay_ms = cooldownMultiplier * statScaler * 100`.
   * Distinct from `cooldownSecs` (keyboard/CCMode-3 path).
   */
  readonly cooldownMultiplier: number;
  /**
   * Hit cycle targets for unmounted entities (u8[6] @ offset 0x30).
   * Bytes [0..2] = normal state, [3..5] = special state (selected by the entity special-state flag).
   * Byte 0 = unused slot sentinel.
   */
  readonly hitCycleMask: readonly number[]; // length 6
  /** Hit cycle targets for mounted entities (u8[6] @ offset 0x38). Same structure as `hitCycleMask`. */
  readonly hitCycleMaskMounted: readonly number[]; // length 6
  /**
   * Grade tier minimum (u32 @ offset 0x40). With `gradeRangeMax`, indexes a 6-entry
   * tooltip-label string array via `labelIndex = max(min, max)`.
   */
  readonly gradeRangeMin: number;
  /** Grade tier maximum (u32 @ offset 0x44). See `gradeRangeMin`. */
  readonly gradeRangeMax: number;
  /**
   * Target-required flag (u32 @ offset 0x48). 1 = explicit target needed, 0 = self/AoE/no-target.
   */
  readonly targetRequired: number;
  /**
   *   1 → 0x39D (single-target), 2 → 0x39E (AoE), other → 0x367 (generic).
   * Special: skill type 0x49 always → 0x368 (teleport).
   */
  readonly packetKind: number;
  /**
   * Self-only cast flag (u32 @ offset 0x50). Server-interpreted: 1 = self-buff/transform.
   * Always paired with targetRequired=0 and aoeModeKind=0 in dataset (6/152 entries).
   */
  readonly selfOnly: number;
  /** Hit sequence type (u32 @ offset 0x54). Server-interpreted. 0 = default, 1–4 = variants. */
  readonly hitSequence: number;
  /**
   * No-target bypass flag (u32 @ offset 0x58). 1 = passive/self-buff, skip targeting.
   */
  readonly noTargetBypass: number;
  /**
   * Hits-enemies flag (u32 @ offset 0x5C). Server-interpreted.
   * 1 = active offensive (always paired with noTargetBypass=0). 0 = buff/passive/support.
   */
  readonly hitsEnemies: number;
  /** Sentinel: `recordIndex + 1` if populated, `0` if loader-zeroed slot. */
  readonly entryId: number;
  /**
   * Initial cooldown flag (u32 @ offset 0x64). Non-zero pre-sets last-cast timestamp on field entry,
   */
  readonly initCooldownFlag: number;
}

export interface Skill {
  readonly id: number;
  /** `null` outside itemname.bin band 5000..5137 (mount/transform 200..246). */
  readonly name: string | null;
  /** `wydskill://` URL or `null` when the skillId falls outside the atlas range. */
  readonly iconUrl: string | null;
  readonly row: SkillRow;
}

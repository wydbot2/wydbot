/**
 * 8-byte slice of the 376-B block carried in `0x114 CharToWorld` (47 slices at `pkt+0x6A0`).
 *
 * ⚠️ **MISNOMER — this is almost certainly NOT an "affect" record.**
 * The `{type, value, level, time}` shape is an unproven placeholder, and the 8-byte grouping
 * itself is in doubt: the only known readers treat `[0x1014 + 1..11]` as a
 * list. So this block reads like a learned-skill / unlock bitmask, not buff-duration records.
 *
 * Do NOT rely on any field below. The block is parsed and forwarded but **never rendered**;
 * the visible buffs come from {@link MAffectPacket} (via `0x336`). Bytes beyond
 * `[+1..+11]` have no known consumer. Field names stay tentative until the
 * full block structure is understood — renaming now would just swap one guess for another.
 */
export interface MAffect {
  type: number;
  value: number;
  level: number;
  time: number;
}

/**
 * 2-byte live-state record carried in `0x336 RefreshScore` (`pkt+0x3E`) and
 * `0x363`/`0x364 CreateMob` (`pkt+0x46`), 32 entries each.
 */
export interface MAffectPacket {
  /**
   * Remaining duration in 8-second units (byte 0 of the wire entry). `0` = empty/expired,
   * max 255 × 8 ≈ 34 min.
   */
  timeOctets: number;
  /**
   * Affect type ID (byte 1 of the wire entry).
   */
  type: number;
}

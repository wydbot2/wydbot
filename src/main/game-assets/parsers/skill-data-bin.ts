/**
 * Parser for `resources/SkillData.bin`.
 *
 *   - 25,792 bytes payload (248 × 0x68) + 4-byte checksum trailer = 25,796 B total.
 *   - XOR every byte with 0x5A (whole file, including trailer).
 *   - Trailer-checksum sentinel `0x1A45C7` (validated by game via
 *     the canonical loader returns 0 silently on mismatch and the boot driver
 *     AND-reduces, so production behaviour is "skill stats stop rendering",
 *     not a crash.
 *   - Per-record layout (after XOR-decode, all little-endian):
 *       u32  @ 0   namePtr               (runtime pointer to skill name C-str in WYD.exe VA space)
 *       u32  @ 4   aoeModeKind           (0/2=normal, 3/4=circular AoE, 5=line, 6=special AoE)
 *       u32  @ 12  cooldownSecs          (cooldown in seconds, keyboard/CCMode-3 cast path)
 *       u32  @ 32  field8                (no client xrefs — reserved/padding)
 *       u32  @ 36  field9                (CCMode-3 eligibility gate B; same OR gate as field7; 56/248 rows nonzero, values 1–255; mutually exclusive with field7)
 *       u32  @ 44  cooldownMultiplier    (auto-combat delay: cooldownMultiplier * statScaler * 100 ms)
 *       u8[6] @ 48 hitCycleMask          (hit targets for unmounted; [0..2]=normal, [3..5]=flag1; 8-byte slot)
 *       u8[6] @ 56 hitCycleMaskMounted   (hit targets for mounted entities; same layout; 8-byte slot)
 *       u32  @ 64  gradeRangeMin         (grade tier min; max(min,max) indexes tooltip class label)
 *       u32  @ 68  gradeRangeMax         (grade tier max; tooltip label index 0..5)
 *       u32  @ 72  targetRequired        (1=requires explicit target, 0=self/AoE/no-target)
 *       u32  @ 76  packetKind            (1=0x39D single-target, 2=0x39E AoE, other=0x367 generic)
 *       u32  @ 80  selfOnly              (1=applies only to caster; always paired with targetRequired=0, aoeModeKind=0)
 *       u32  @ 84  hitSequence           (0=default; 1..4=variant hit tier; server-interpreted, client never reads)
 *       u32  @ 88  noTargetBypass        (1=skip targeting: self-buff/passive/no-target)
 *       u32  @ 92  hitsEnemies           (1=can damage/affect enemies; server-interpreted)
 *       u32  @ 96  entryId               (sentinel: recordIndex + 1, or 0 if unused)
 *       u32  @ 100 initCooldownFlag      (≠0 → timer pre-set to currentTime on FieldScene::Start)
 */

import type { SkillRow } from '@shared/types/skill-types';
import { detectRecordLayout } from './asset-format-error';

const ROW_SIZE = 0x68; // 104
const TRAILER_SIZES = [0, 4] as const;
const XOR_KEY = 0x5a;
/** OOM guard: skill table is 248 rows; a future expansion stays well under this. */
const MAX_SKILL_ROWS = 4096;

const xorDecode = (src: Buffer): Buffer => {
  const out = Buffer.allocUnsafe(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] ^ XOR_KEY;
  return out;
};

const readRow = (buf: Buffer, id: number, base: number): SkillRow => {
  const u32 = (off: number): number => buf.readUInt32LE(base + off);
  const mask = (off: number): number[] => Array.from(buf.subarray(base + off, base + off + 6));

  return {
    id,
    namePtr: u32(0),
    aoeModeKind: u32(4),
    baseHitrate: u32(8),
    cooldownSecs: u32(12),
    castRange: u32(16),
    weaponStatType: u32(20),
    baseDamage: u32(24),
    field7: u32(28),
    field8: u32(32),
    field9: u32(36),
    auxDamage: u32(40),
    cooldownMultiplier: u32(44),
    hitCycleMask: mask(48),
    hitCycleMaskMounted: mask(56),
    gradeRangeMin: u32(64),
    gradeRangeMax: u32(68),
    targetRequired: u32(72),
    packetKind: u32(76),
    selfOnly: u32(80),
    hitSequence: u32(84),
    noTargetBypass: u32(88),
    hitsEnemies: u32(92),
    entryId: u32(96),
    initCooldownFlag: u32(100),
  };
};

/**
 * Parse a SkillData.bin buffer into typed rows.
 *
 * Row count is DERIVED from the file size (payload = rowCount × 104, + optional
 * 4-byte trailer dropped without checksum validation). Throws AssetFormatError
 * on a size that matches no clean row multiple — so a drifted skill table is a
 * visible failure, never a silent misread.
 */
export const parseSkillDataBin = (buffer: Buffer): SkillRow[] => {
  const { count, payloadSize } = detectRecordLayout(buffer, {
    asset: 'SkillData.bin',
    widths: [ROW_SIZE],
    trailers: TRAILER_SIZES,
    maxCount: MAX_SKILL_ROWS,
    minCount: 1,
  });
  const decoded = xorDecode(buffer.subarray(0, payloadSize));
  const rows: SkillRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = readRow(decoded, i, i * ROW_SIZE);
  }
  return rows;
};

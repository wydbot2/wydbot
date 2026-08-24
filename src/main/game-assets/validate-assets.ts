/**
 * Boot-critical asset validation.
 *
 * Dry-parses the binary game-data files the client cannot run without, turning
 * "file present" into "file parseable". Used two ways:
 *   - the asset-update gate validates a freshly-downloaded patch in STAGING
 *     before promoting it, so the live store never holds an unparseable file;
 *   - the boot sequence validates the live store before releasing the asset
 *     barrier, so a bad file surfaces as an on-screen error (never a silent
 *     proceed on stale data).
 *
 * `readAsset` returns the file bytes for a store-relative name, or null if
 * absent — either way a failure is a typed `AssetFailure`, never a throw.
 */

import type { AssetFailure } from '@shared/types/asset-health-types';
import { missingAssetFailure, toAssetFailure } from './parsers/asset-format-error';
import {
  parseExtraItemBin,
  parseItemIconBin,
  parseItemListBin,
  parseItemnameBin,
  parseMountDataBin,
  parseMountDataVBin,
  parseSkillDataBin,
} from './parsers';

export type AssetReader = (name: string) => Promise<Buffer | null>;

/** The size-strict binaries whose drift bricks the item/skill DB — validated at the gate and at boot. */
const BOOT_CRITICAL: ReadonlyArray<{ name: string; parse: (b: Buffer) => unknown }> = [
  { name: 'ItemList.bin', parse: parseItemListBin },
  { name: 'extraitem.bin', parse: parseExtraItemBin },
  { name: 'itemname.bin', parse: parseItemnameBin },
  { name: 'MountData.bin', parse: parseMountDataBin },
  { name: 'MountDataV.bin', parse: parseMountDataVBin },
  { name: 'SkillData.bin', parse: parseSkillDataBin },
  { name: 'itemicon.bin', parse: parseItemIconBin },
];

/**
 * Parse every boot-critical asset via `readAsset`; return the list of failures
 * (empty ⇒ all parseable). Never throws.
 */
export const validateBootCriticalAssets = async (
  readAsset: AssetReader,
): Promise<AssetFailure[]> => {
  const failures: AssetFailure[] = [];
  for (const { name, parse } of BOOT_CRITICAL) {
    let buf: Buffer | null;
    try {
      buf = await readAsset(name);
    } catch {
      buf = null;
    }
    if (buf === null) {
      failures.push(missingAssetFailure(name));
      continue;
    }
    try {
      parse(buf);
    } catch (err) {
      failures.push(toAssetFailure(name, err));
    }
  }
  return failures;
};

/** Human-readable one-line summary for a splash error label (pt-BR). */
export const describeAssetFailures = (failures: readonly AssetFailure[]): string => {
  if (failures.length === 0) return '';
  const first = failures[0];
  const more = failures.length > 1 ? ` (+${failures.length - 1})` : '';
  return `Falha ao carregar ${first.asset} — ${first.actual}${more}`;
};

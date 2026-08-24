/**
 * The ONLY game files our client needs, mapped from their in-zip path (RaidHut
 * Global `Global.zip` / patch zips) to our flat `/resources`-relative layout.
 *
 * Every file is written RAW (no transform): our parsers consume the CDN bytes
 * as-is — encrypted data bins decrypt internally, localized text comes
 * already-decoded from `Lang/PT/`. Entries not matched here are never extracted.
 */

export interface AssetAllowEntry {
  /** Destination path relative to the asset store root (our `/resources` layout). */
  readonly dest: string;
  /** Required entries gate the store-completeness check; maps are best-effort. */
  readonly required: boolean;
}

// Exact in-zip path (lowercased) → dest. Localized text uses Lang/PT (the Korean
// root/UI copies are intentionally excluded); data bins come from the root.
const EXACT: Readonly<Record<string, AssetAllowEntry>> = {
  'lang/pt/strdef.bin': { dest: 'strdef.bin', required: true },
  'lang/pt/itemname.bin': { dest: 'itemname.bin', required: true },
  // Compose-menu node labels (`**_Name_** <rowid> …`), keyed by Missionitems rowid.
  'lang/pt/missionhelp.dat': { dest: 'missionhelp.dat', required: true },
  'lang/pt/itemhelp.dat': { dest: 'itemhelp.dat', required: true },
  'lang/pt/minimap.dat': { dest: 'minimap.dat', required: true },
  'itemlist.bin': { dest: 'ItemList.bin', required: true },
  'extraitem.bin': { dest: 'extraitem.bin', required: true },
  'skilldata.bin': { dest: 'SkillData.bin', required: true },
  'mountdata.bin': { dest: 'MountData.bin', required: true },
  'mountdatav.bin': { dest: 'MountDataV.bin', required: true },
  'itemicon.bin': { dest: 'itemicon.bin', required: true },
  'object.bin': { dest: 'object.bin', required: true },
  'serverlist.bin': { dest: 'serverlist.bin', required: true },
  // Composition recipe catalog — the PanelMissionMix (window 0x1e) compose menu's
  // data source. The base Global.zip ships an incomplete prefix; the full table
  // arrives via the launcher's version patches (our updater applies them).
  'missionitems.bin': { dest: 'Missionitems.bin', required: true },
  'env/attributemap.dat': { dest: 'AttributeMap.dat', required: true },
  'ui/newamulon.wyt': { dest: 'NewAmulOn.wyt', required: true },
};

// Icon atlases → Icons/ (the icon cache scandir's this dir; pattern itemiconNN.wyt).
const ICON_RULE = /^ui\/itemicon\d*\.wyt$/;
// Map sectors (all, wildcard) → maps/. Dest keeps the original basename casing.
const MAP_RULES: readonly RegExp[] = [/^env\/field\d{4}\.(?:trn|dat)$/, /^ui\/m\d{4}\.wyt$/];

const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Resolve an in-zip path to its store dest + required flag, or null to skip (autodrain). */
export const matchAssetPath = (inZipPath: string): AssetAllowEntry | null => {
  const norm = normalize(inZipPath);
  const lower = norm.toLowerCase();
  const exact = EXACT[lower];
  if (exact) return exact;
  const base = norm.split('/').pop() ?? norm;
  if (ICON_RULE.test(lower)) {
    return { dest: `Icons/${base}`, required: false };
  }
  if (MAP_RULES.some((re) => re.test(lower))) {
    return { dest: `maps/${base}`, required: false };
  }
  return null;
};

/** Dest paths that MUST be present for the store to count as complete. */
export const REQUIRED_ASSET_DESTS: readonly string[] = Object.values(EXACT)
  .filter((e) => e.required)
  .map((e) => e.dest);

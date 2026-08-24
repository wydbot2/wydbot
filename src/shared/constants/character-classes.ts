import type { ECharClass } from '@shared/types/game-structures';

/**
 * Canonical class display names — verified against `resources/strdef.bin`
 * records 121–124 (the bundled pt-BR locale of the game).
 * The pt-BR locale keeps these in English; do NOT translate.
 *
 * Indexed by `ECharClass` value (0..3). Suitable for direct lookup
 * (`CLASS_DISPLAY_NAMES[player.charClass]`) and bitmask iteration.
 */
export const CLASS_DISPLAY_NAMES = [
  'TransKnight',
  'Foema',
  'BeastMaster',
  'Huntress',
] as const satisfies readonly [string, string, string, string];

export type CharClassDisplayName = (typeof CLASS_DISPLAY_NAMES)[number];

/**
 * Asset filename stems — verified at the bytecode level via WYD.exe
 */
export const CLASS_ASSET_STEMS = ['trans', 'foema', 'beast', 'hunter'] as const;

/**
 * Canonical evolution tiers. Display rule:
 *   - 'Mortal'    → no suffix     (e.g. "Foema")
 *   - 'Arch'      → " Arch"       (e.g. "Foema Arch")
 *   - 'Celestial' → " Celestial"  (e.g. "Foema Celestial")
 */
export const CLASS_TIERS = ['Mortal', 'Arch', 'Celestial'] as const;
export type ClassTier = (typeof CLASS_TIERS)[number];

/** Compose `${className}` or `${className} ${tier}` per the rule above. */
export const formatClassWithTier = (charClass: ECharClass, tier: ClassTier): string => {
  const base = CLASS_DISPLAY_NAMES[charClass];
  return tier === 'Mortal' ? base : `${base} ${tier}`;
};

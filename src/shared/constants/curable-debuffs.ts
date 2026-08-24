/**
 * Affect types curáveis por Desintoxicar (skill `0x19`) / Erva de Cura (item `415`).
 *
 * v1 HIGH-confidence set, derived from `itemhelp.dat` dump + cross-ref with
 * the buff/debuff system.
 *
 * **Conservative set** — Desintoxicar may cure a broader server-authoritative
 * superset (tooltip says "sintomas COMO veneno ou baixa imunidade" — illustrative).
 */
export const CURABLE_DEBUFF_TYPES: ReadonlySet<number> = new Set([
  0x01, // Lentidão (slow) — Erva de Cura tooltip "lentidao"
  0x14, // Veneno (poison, variant A) — both tools cure
  0x24, // Veneno (poison, variant B — distinct sprite, same name)
]);

/** True iff the given affect.type byte is a debuff that the v1 cure-set removes. */
export const isCurableDebuff = (affectType: number): boolean =>
  CURABLE_DEBUFF_TYPES.has(affectType);

/**
 * Shop panel slot encoding for C2S 0x379.
 *
 *   wireSlot = (linear / 9) * 0x1b + (linear % 9)
 * where `linear` is the panel cell index 0..26 (widget+0x331 / 0x17C grid).
 * Identity for 0..8; remaps rows 1–2 into page×27 + col (e.g. 16 → 34).
 */

/** Encode linear 0x17C panel index → wire ShopSlot for 0x379 @+0x0E. */
export const encodeShopWireSlot = (linearSlot: number): number =>
  Math.floor(linearSlot / 9) * 0x1b + (linearSlot % 9);

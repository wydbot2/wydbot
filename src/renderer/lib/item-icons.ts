const MIN_ITEM_ID = 1;
const PAD_WIDTH = 5;

const padId = (n: number): string => String(n).padStart(PAD_WIDTH, '0');

/**
 * Icon URL for an item id. No upper id cap: the item table grows with game
 * patches. A nonexistent icon PNG 404s at the `wydicon://` protocol — consumers
 * must flip to their text/icon fallback from the `<img>` `onError` event
 * (see InvCell/EquipCell/AutoDropItemChip). Capping here would silently drop
 * icons for every new-id item.
 */
export const getItemIconUrl = (index: number): string | undefined => {
  if (!Number.isInteger(index) || index < MIN_ITEM_ID) {
    return undefined;
  }
  return `wydicon://icons/${padId(index)}.png`;
};

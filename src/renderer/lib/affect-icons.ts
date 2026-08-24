import { AFFECT_SPRITE_TABLE } from '@shared/constants/affect-sprite-table';

const PAD_WIDTH = 3;
const padId = (n: number): string => String(n).padStart(PAD_WIDTH, '0');

/**
 * Resolve a `wydaffect://` URL for the given affect type. Returns `undefined`
 * when the type has no sprite.
 */
export const getAffectIconUrl = (affectType: number): string | undefined => {
  const spriteId = AFFECT_SPRITE_TABLE[affectType];
  if (spriteId === undefined) return undefined;
  return `wydaffect://affects/${padId(spriteId)}.png`;
};

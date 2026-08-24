import { decodeWyt, type WytAtlas } from '@main/game-assets/parsers';
import { assetsLogger } from '@main/logging';

/**
 * Decode atlas buffers keyed by name, skipping any that fail — a malformed atlas
 * drops only its own cells instead of bricking the cache at boot. Throws only
 * when EVERY atlas fails, since a wholesale decode failure is a real boot error.
 */
export const decodeAtlasesResilient = (
  atlasOrder: readonly string[],
  atlasBufs: readonly Buffer[],
  label: string,
): Map<string, WytAtlas> => {
  const atlases = new Map<string, WytAtlas>();
  for (let i = 0; i < atlasOrder.length; i++) {
    try {
      atlases.set(atlasOrder[i], decodeWyt(atlasBufs[i]));
    } catch (err) {
      assetsLogger.warn(
        `${label}: atlas ${atlasOrder[i]} failed to decode, skipping — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (atlasOrder.length > 0 && atlases.size === 0) {
    throw new Error(`${label}: all ${atlasOrder.length} atlases failed to decode`);
  }
  return atlases;
};

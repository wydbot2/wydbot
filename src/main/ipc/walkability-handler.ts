import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { WORLD_SIZE, type HeightmapPayload } from '@shared/ipc/walkability';
import { buildWorldHeightmap, getHeightmapHash } from '@main/game-assets';
import { assetsReady } from '@main/asset-update/asset-ready';
import { secureEmptyInvoke } from './secure-handler';
import { assetsLogger } from '../logging';

/**
 * Serves the canonical 4096×4096 i8 world heightmap to the renderer ONCE at
 * boot. After the first `invoke` resolves, the renderer caches the buffer and
 * runs all path-planning queries locally (zero IPC roundtrip per query).
 *
 * Mirrors the eager pattern of `attribute-map-handler.ts`: build → cache →
 * serve the same `ArrayBuffer` on every subsequent invoke. The buffer is
 * large (~16 MB), so we slice it down to a tight `ArrayBuffer` once and let
 * Electron's structured clone hand the renderer a fresh view onto the same
 * bytes.
 */

let cached: HeightmapPayload | undefined;

const load = async (): Promise<HeightmapPayload> => {
  if (cached) return cached;
  await assetsReady();

  const heightmap = await buildWorldHeightmap();

  if (heightmap.length !== WORLD_SIZE * WORLD_SIZE) {
    throw new Error(
      `World heightmap has wrong size: got ${heightmap.length}, expected ${WORLD_SIZE * WORLD_SIZE}`,
    );
  }

  // Re-slice on a tight ArrayBuffer so we never hand the renderer a view that
  // is wider than the heightmap itself (defensive — the builder currently
  // owns its own ArrayBuffer end-to-end).
  const src = heightmap.buffer;
  const isTight = heightmap.byteOffset === 0 && heightmap.byteLength === src.byteLength;
  const ab: ArrayBuffer =
    src instanceof ArrayBuffer && isTight ? src : new Int8Array(heightmap).buffer;

  const payload: HeightmapPayload = {
    buffer: ab,
    meta: {
      width: WORLD_SIZE,
      height: WORLD_SIZE,
      hash: getHeightmapHash(),
    },
  };
  cached = payload;
  assetsLogger.info(
    `Walkability heightmap ready for IPC: ${WORLD_SIZE}×${WORLD_SIZE}, hash=${payload.meta.hash}`,
  );
  return payload;
};

export const registerWalkabilityHandler = (): void => {
  ipcMain.handle(
    IPC.WALKABILITY_GET_HEIGHTMAP,
    secureEmptyInvoke(() => load()),
  );
};

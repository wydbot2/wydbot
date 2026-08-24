import { join } from 'path';
import { assetStoreRoot } from '@main/asset-update/asset-store';

/**
 * Game-asset source: the writable userData store, populated by the asset-update
 * boot gate from the official CDN — in dev AND packaged builds alike
 * (`resources/` is never shipped nor read from the repo).
 */
export const getResourcePath = (...segments: string[]): string =>
  join(assetStoreRoot(), ...segments);

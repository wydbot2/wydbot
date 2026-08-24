import type { IconCacheManager } from '@main/cache/icons';
import type { MapCacheManager } from '@main/cache/maps';
import type { AmulCacheManager } from '@main/cache/amul';

/**
 * Cache managers the orchestrator warms in dependency order
 * (icons → maps → amul → ItemDb). Injected by the bootstrap so the
 * orchestrator never constructs globals itself.
 */
export interface BootOrchestratorDeps {
  iconCache: IconCacheManager;
  mapCache: MapCacheManager;
  amulCache: AmulCacheManager;
}

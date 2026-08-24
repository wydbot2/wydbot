import type { IpcBootProgress } from '@shared/ipc/ipc-api';
import type { AssetStage } from '@main/asset-update';
import { emitBootProgress } from '@main/ipc/boot-progress-emitter';

// Per-stage global percent allocation — icons owns ~94% of cold time.
//   window-create: 0 → icons: 5..80 → maps: 80..90 → amul: 90..95 → itemdb: 95..100 → ready: 100
export const BOOT_STAGE_COUNT = 6;

export const emit = (payload: IpcBootProgress): void => emitBootProgress(payload);

/** Maps a cache manager's local (current/total) ticks onto its global percent slice. */
export const cacheProgressEmitter = (
  stage: 'icons' | 'maps' | 'amul',
  stageIndex: number,
  pctStart: number,
  pctEnd: number,
  labelDetailPrefix: string,
) => {
  return (info: { current: number; total: number }): void => {
    const localPct = info.total > 0 ? info.current / info.total : 1;
    emit({
      stage,
      stageIndex,
      stageCount: BOOT_STAGE_COUNT,
      percent: Math.round(pctStart + (pctEnd - pctStart) * localPct),
      label: 'Carregando recursos…',
      detail: `${labelDetailPrefix} (${info.current}/${info.total})`,
    });
  };
};

export const ASSET_STAGE_LABEL: Record<AssetStage, string> = {
  'assets-checking': 'Verificando recursos do jogo…',
  'assets-downloading': 'Baixando recursos do jogo…',
  'assets-extracting': 'Extraindo arquivos…',
};

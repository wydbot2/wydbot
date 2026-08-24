/**
 * Boot orchestrator — single owner of the startup sequence.
 *
 * Stages run in dependency order, each fail-closed (splash error + retry):
 *   game-asset gate → boot-critical validation
 *   → cache warming (icons → maps → amul) → eager ItemDb build → ready.
 *
 * Ordering invariants this module exists to guarantee:
 *   - `markAssetsReady()` fires LAST, after every derived cache AND the ItemDb
 *     are built. Asset-reading IPC handlers can never observe a half-warmed
 *     boot — previously the barrier opened before the icon cache, letting the
 *     ItemDb bake `hasIcon=false` into its cached singleton for the session.
 *   - The ItemDb is built only against a ready icon cache, and is invalidated
 *     before every (re)build so a stale manifest can never linger in it.
 */

import { getResourcePath, readFileOrNull } from '@main/lib';
import { runAssetUpdateGate, markAssetsReady, type AssetStage } from '@main/asset-update';
import { invalidateItemDb, warmItemDb } from '@main/game-assets';
import {
  describeAssetFailures,
  validateBootCriticalAssets,
} from '@main/game-assets/validate-assets';
import { logger } from '@main/logging';

import { ASSET_STAGE_LABEL, BOOT_STAGE_COUNT, cacheProgressEmitter, emit } from './boot-progress';
import type { BootOrchestratorDeps } from './boot-types';

export class BootOrchestrator {
  private cacheInitRunning = false;

  constructor(private readonly deps: BootOrchestratorDeps) {}

  /** Full boot; safe to re-invoke (splash "Tentar novamente" → `retry()`). */
  public async start(): Promise<void> {
    emit({
      stage: 'window-create',
      stageIndex: 0,
      stageCount: BOOT_STAGE_COUNT,
      percent: 0,
      label: 'Iniciando…',
    });
    await this.runStartupSequence();
  }

  public retry(): void {
    void this.start();
  }

  /**
   * Proceeds past a validation error on the current store; the degraded DB
   * drives the in-game banner.
   */
  public continueDegraded(): void {
    void this.proceedToReady();
  }

  // Boot gates run in order: game-asset update → cache warming.
  // Each is fail-closed; only a 'proceed' continues. The asset gate cold-bootstraps
  // the userData store on first launch, then applies incremental patches.
  private async runStartupSequence(): Promise<void> {
    // Download + extraction are interleaved (streaming). Show a single combined
    // line: "X / Y MB · N arquivos", with both numbers climbing live.
    let downloadedMb = 0;
    let totalMb = 0;
    let extractedFiles = 0;
    let lastMbEmitted = -1;
    const emitAssetProgress = (stage: AssetStage): void => {
      const parts: string[] = [];
      if (totalMb > 0) parts.push(`${downloadedMb} / ${totalMb} MB`);
      else if (downloadedMb > 0) parts.push(`${downloadedMb} MB`);
      if (extractedFiles > 0) parts.push(`${extractedFiles} arquivos`);
      emit({
        stage,
        stageIndex: 0,
        stageCount: BOOT_STAGE_COUNT,
        percent: totalMb > 0 ? Math.min(5, Math.round((downloadedMb / totalMb) * 5)) : 0,
        label: ASSET_STAGE_LABEL[stage],
        detail: parts.length > 0 ? parts.join(' · ') : undefined,
      });
    };
    const assets = await runAssetUpdateGate(
      (stage: AssetStage) => emitAssetProgress(stage),
      {
        info: (m) => logger.info(m),
        warn: (m) => logger.warn(m),
        error: (m) => logger.error(m),
      },
      (received, total) => {
        downloadedMb = Math.floor(received / 1_048_576);
        totalMb = Math.round(total / 1_048_576);
        if (downloadedMb === lastMbEmitted) return; // throttle to whole-MB steps
        lastMbEmitted = downloadedMb;
        emitAssetProgress('assets-downloading');
      },
      () => {
        extractedFiles += 1;
        // Byte ticks already re-emit the combined line; coalesce the per-file emits.
        if (extractedFiles % 16 === 0) emitAssetProgress('assets-downloading');
      },
    );
    if (assets !== 'proceed') {
      const protocolIncompatible = assets === 'protocol-incompatible';
      emit({
        stage: 'error',
        stageIndex: 0,
        stageCount: BOOT_STAGE_COUNT,
        percent: 0,
        label: protocolIncompatible
          ? 'Atualização do jogo ainda não suportada'
          : 'Falha ao baixar recursos do jogo',
        errorCode: protocolIncompatible ? 'protocol-incompatible' : 'asset-update-failed',
        errorHint: protocolIncompatible
          ? 'O executável oficial mudou além do que este WYDBot consegue validar com segurança.'
          : 'Verifique sua conexão com a internet e tente novamente.',
      });
      return; // barrier stays pending; a successful BOOT_RETRY resolves it
    }

    // "Present" ≠ "parseable": validate before the barrier so an unreadable file surfaces on screen, not silently.
    const failures = await validateBootCriticalAssets((name) =>
      readFileOrNull(getResourcePath(name)),
    );
    if (failures.length > 0) {
      logger.error(
        `Boot asset validation failed: ${failures.map((f) => `${f.asset}(${f.reason})`).join(', ')}`,
      );
      emit({
        stage: 'error',
        stageIndex: 0,
        stageCount: BOOT_STAGE_COUNT,
        percent: 0,
        label: describeAssetFailures(failures),
        errorCode: 'asset-format-invalid',
        errorHint:
          'O jogo foi atualizado com um formato que este aplicativo ainda não reconhece. ' +
          'Tente novamente mais tarde, ou continue com os dados anteriores.',
        canContinueDegraded: true,
      });
      return; // barrier stays pending; BOOT_RETRY or BOOT_CONTINUE_DEGRADED resolves it
    }

    await this.proceedToReady();
  }

  // Caches first, ItemDb second, asset barrier LAST — a handler released earlier
  // could observe a half-warmed boot.
  private async proceedToReady(): Promise<void> {
    // Defensive: a DB built before the caches were ready would carry stale
    // hasIcon flags for the whole session. Dropping it HERE (not after the
    // caches) lets a renderer request that fires mid-warm join the single
    // in-flight rebuild instead of racing a duplicate build.
    invalidateItemDb();
    const cachesOk = await this.runCacheInit();
    if (!cachesOk) return;
    await this.warmItemDbStage();
    markAssetsReady();
    emit({
      stage: 'ready',
      stageIndex: 5,
      stageCount: BOOT_STAGE_COUNT,
      percent: 100,
      label: 'Pronto',
    });
    logger.info('Application ready');
  }

  /** Returns false when the cache stage failed (error already on the splash). */
  private async runCacheInit(): Promise<boolean> {
    if (this.cacheInitRunning) return false;
    this.cacheInitRunning = true;
    try {
      emit({
        stage: 'icons',
        stageIndex: 1,
        stageCount: BOOT_STAGE_COUNT,
        percent: 5,
        label: 'Carregando recursos…',
      });
      await this.deps.iconCache.initialize({
        onProgress: cacheProgressEmitter('icons', 1, 5, 80, 'Ícones'),
      });
      emit({
        stage: 'icons',
        stageIndex: 1,
        stageCount: BOOT_STAGE_COUNT,
        percent: 80,
        label: 'Carregando recursos…',
        detail: 'Ícones prontos',
      });

      await this.deps.mapCache.initialize({
        onProgress: cacheProgressEmitter('maps', 2, 80, 90, 'Mapas'),
      });
      emit({
        stage: 'maps',
        stageIndex: 2,
        stageCount: BOOT_STAGE_COUNT,
        percent: 90,
        label: 'Carregando recursos…',
        detail: 'Mapas prontos',
      });

      await this.deps.amulCache.initialize({
        onProgress: cacheProgressEmitter('amul', 3, 90, 95, 'Buffs/skills'),
      });
      emit({
        stage: 'amul',
        stageIndex: 3,
        stageCount: BOOT_STAGE_COUNT,
        percent: 95,
        label: 'Carregando recursos…',
        detail: 'Buffs/skills prontos',
      });
      return true;
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      logger.error('Boot cache init failed', { code });
      emit({
        stage: 'error',
        stageIndex: 0,
        stageCount: BOOT_STAGE_COUNT,
        percent: 0,
        label: 'Falha ao inicializar',
        errorCode: code,
        errorHint: 'Tente novamente. Se o problema persistir, reinstale o aplicativo.',
      });
      return false;
    } finally {
      this.cacheInitRunning = false;
    }
  }

  // Eager (not lazy): the DB is part of the boot contract — when the splash says
  // "Pronto", every consumer (item search, auto-drop blacklist, HUD) can rely on it.
  private async warmItemDbStage(): Promise<void> {
    emit({
      stage: 'itemdb',
      stageIndex: 4,
      stageCount: BOOT_STAGE_COUNT,
      percent: 96,
      label: 'Carregando recursos…',
      detail: 'Itens',
    });
    await warmItemDb(this.deps.iconCache);
  }
}

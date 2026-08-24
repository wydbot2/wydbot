import { net } from 'electron';
import { ASSET_GAME_KEY, ASSET_INFO_URL, ASSET_REQUEST_HEADERS } from '@shared/constants/asset-cdn';
import { RaidInfoSchema, selectGameAssetSource, type GameAssetSource } from '@shared/assets';
import { delay } from '../lib/delay';

// Env override (ASSET_INFO_URL) points at a QA manifest. `?t=` + no-store dodge
// the CDN cache (and Cloudflare's negative-cache of transient origin 404s).
const RESOLVED_URL = process.env['ASSET_INFO_URL']?.trim() || ASSET_INFO_URL;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/**
 * Fetch + validate RaidHut's CloudFront info.json and project the configured game
 * onto an https-forced asset source. Retries transient failures, then throws —
 * the caller is fail-closed (blocks boot with a retry button).
 */
export const fetchGameAssetSource = async (): Promise<GameAssetSource> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await net.fetch(`${RESOLVED_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: ASSET_REQUEST_HEADERS,
      });
      if (!res.ok) throw new Error(`info.json HTTP ${res.status}`);
      const json: unknown = await res.json();
      return selectGameAssetSource(RaidInfoSchema.parse(json), ASSET_GAME_KEY);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await delay(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('info.json fetch failed');
};

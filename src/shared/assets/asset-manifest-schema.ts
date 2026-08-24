import { z } from 'zod';

/**
 * Validates the slice of RaidHut's CloudFront `info.json` the asset updater uses.
 * The real document carries many more fields (banners, maintenance, social…) —
 * `passthrough` keeps them without coupling us to their shape.
 */
const URL_RE = /^https?:\/\/\S+$/i;

const RaidGameSchema = z
  .object({
    name: z.string().min(1),
    version: z.number().int().nonnegative(),
    links: z
      .object({
        download: z.string().regex(URL_RE, 'links.download must be an http(s) url'),
        patches: z.string().regex(URL_RE, 'links.patches must be an http(s) url'),
      })
      .passthrough(),
  })
  .passthrough();

export const RaidInfoSchema = z
  .object({
    games: z.record(z.string(), RaidGameSchema),
  })
  .passthrough();

export type RaidInfo = z.infer<typeof RaidInfoSchema>;

/** Normalized, https-forced descriptor for one game's downloadable assets. */
export interface GameAssetSource {
  /** Folder/display name, e.g. "WYD Global". */
  readonly name: string;
  /** Integer patch level from the manifest (the remote asset version). */
  readonly version: number;
  /** Full base zip URL (https-forced). */
  readonly baseZipUrl: string;
  /** Patch base URL (https-forced, trailing slash); patch N = `${patchBaseUrl}${n}.zip`. */
  readonly patchBaseUrl: string;
}

/** Force https:// — the manifest advertises patch URLs over plain http. */
const forceHttps = (u: string): string => u.replace(/^http:\/\//i, 'https://');

/** Project the validated manifest onto a single game's https asset source. Throws if absent. */
export const selectGameAssetSource = (info: RaidInfo, gameKey: string): GameAssetSource => {
  const game = info.games[gameKey];
  if (!game) {
    throw new Error(`info.json has no game "${gameKey}"`);
  }
  const patches = forceHttps(game.links.patches);
  return {
    name: game.name,
    version: game.version,
    baseZipUrl: forceHttps(game.links.download),
    patchBaseUrl: patches.endsWith('/') ? patches : `${patches}/`,
  };
};

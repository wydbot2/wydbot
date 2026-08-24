/**
 * RaidHut game-asset CDN — the same source the official launcher hits (we host
 * nothing). The manifest is the CloudFront `info.json`; every artifact URL is read
 * from it. Override with the `ASSET_INFO_URL` env var for QA.
 */
export const ASSET_INFO_URL = 'https://d16tndoz98nwcc.cloudfront.net/info.json';

/** Game key within `info.json.games` whose assets our client uses. */
export const ASSET_GAME_KEY = 'Global';

/** The CDN serves binaries only to launcher-like requests, not Electron's default UA. */
export const ASSET_REQUEST_HEADERS = {
  'User-Agent': 'WYD Launcher',
  Accept: 'application/zip,application/octet-stream,*/*',
} as const;

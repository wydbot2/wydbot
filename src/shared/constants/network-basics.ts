/** Basic definitions related to the server's network connection. */

/** Max packet length in bytes (1 MB) */
export const MAX_PACKET_LENGTH = 1024 * 1024;

/**
 * Code used in the game network protocol to initiate the connection.
 * Every player must send this 4-byte value as the first packet.
 */
export const INIT_CODE = 0x1f11f311;

/**
 * Base for the obfuscated version field of the enterMob (0x213) packet.
 *   s = rand() % 9 + 1              // 1..9, re-rolled each login
 *   version = s + (BASE << s) * 10
 * The server recovers the shift via `version % 10` and re-derives the expected value.
 */
export const CLINE_VERSION_BASE = 0xfb8c; // 64396

/**
 * Client version sent in the AccountLogin (0x20D) packet at offset 92 —
 * distinct from the RequestMobLogin (0x213) version (see CLINE_VERSION_BASE).
 *
 * Bumped from 0x0C8E7301 → 0x0C9C9301 by version.dll from official patch 727.
 * The server replies
 * message="769" (build number) when an outdated value is sent, then FINs. The
 * `+0x301` (= 769) low build segment is stable; the high DAT segment is patched
 * in memory by the official proxy DLL.
 */
export const ACCOUNT_CLIENT_VERSION = 0x0c9c9301;

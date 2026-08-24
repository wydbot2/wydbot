import { logger } from './logger';

const SERVER_MESSAGE_INDEX_OFFSET = 1000;
const SERVER_POPUP_SUBTYPES = new Set([0, 4]);

export interface ServerMessageResolution {
  code: number;
  index: number;
  text: string;
  found: boolean;
}

let messages: string[] | null = null;
let loadPromise: Promise<void> | null = null;

export const initStrdefLookup = async (): Promise<void> => {
  if (messages) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    messages = await window.wydAPI.loadStrdef();
    logger.log(`[STRDEF] Loaded ${messages.length} server messages`);
  })();

  try {
    await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
};

/**
 * WYD.exe resolves packet 0x105 codes through strdef[1000 + code].
 * Keep the numeric fallback explicit so callers can distinguish missing assets
 * from a real server-provided message.
 */
export const resolveServerMessage = (code: number): ServerMessageResolution => {
  const fallback = `[#${code}]`;
  const index = code + SERVER_MESSAGE_INDEX_OFFSET;
  if (!Number.isInteger(code) || !messages || index < 0 || index >= messages.length) {
    return { code, index, text: fallback, found: false };
  }

  const text = messages[index];
  if (!text) return { code, index, text: fallback, found: false };

  return { code, index, text, found: true };
};

export const getServerMessage = (code: number): string => resolveServerMessage(code).text;

/** Packet 0x105 subtypes rendered by WYD.exe as coded popups. */
export const isServerPopupSubtype = (subtype: number): boolean =>
  SERVER_POPUP_SUBTYPES.has(subtype);

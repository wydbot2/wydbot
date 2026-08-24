import type { ServerChannel } from '@shared/constants/server-channels';
import { ProxyListUrlSchema } from '@shared/proxy-config';
import { LoginCredentialsSchema } from './login-form-schema';

export interface ReconnectBag {
  channel: ServerChannel | null;
  username: string;
  password: string;
  token: string;
  hardwareIdentitySeed: string | null;
  proxyListUrl: string | null;
  charIndex: number;
}

export const emptyReconnectBag = (): ReconnectBag => ({
  channel: null,
  username: '',
  password: '',
  token: '',
  hardwareIdentitySeed: null,
  proxyListUrl: null,
  charIndex: 0,
});

/** Credentials are valid only with the mandatory 4–6 digit numeric password. */
export const isBagArmed = (bag: ReconnectBag | null | undefined): boolean =>
  bag != null &&
  bag.channel != null &&
  LoginCredentialsSchema.safeParse({
    username: bag.username,
    password: bag.password,
    token: bag.token,
  }).success &&
  (bag.proxyListUrl === null || ProxyListUrlSchema.safeParse(bag.proxyListUrl).success) &&
  bag.charIndex >= 0 &&
  bag.charIndex <= 3;

export const RECONNECT_FIRST_DELAY_MS = 2000;
export const RECONNECT_RETRY_FLOOR_MS = 3000;
export const RECONNECT_BACKOFF_CAP_MS = 60_000;

/** From `connect()` until TCP `connected`. */
export const RECONNECT_CONNECT_TIMEOUT_MS = 8_000;

/** From TCP `connected` until CharToWorld. */
export const RECONNECT_HANDSHAKE_TIMEOUT_MS = 15_000;

/** DISCONNECT IPC + residual socket close per intentional tear-down. */
export const RECONNECT_CLOSE_BUDGET = 2;

/** Attempt 1 = 2s; later = 3×2^(n-2) capped at 60s (CONNECT throttle floor). */
export const reconnectBackoffMs = (attempt: number): number => {
  const n = Math.max(1, attempt);
  if (n <= 1) return RECONNECT_FIRST_DELAY_MS;
  return Math.min(RECONNECT_BACKOFF_CAP_MS, RECONNECT_RETRY_FLOOR_MS * 2 ** (n - 2));
};

export const DEFAULT_RECONNECT_MAX_ATTEMPTS = 20;

export const RECONNECT_FAIL = {
  CREDENTIALS: 'Credenciais incompletas.',
  MID_PIPELINE: 'Desconectado durante reconexão',
  CONNECTION_ERROR: 'Connection error',
  CONNECT_TIMEOUT: 'Não foi possível conectar ao servidor',
  HANDSHAKE_TIMEOUT: 'Não foi possível autenticar a tempo',
  TOKEN_REJECT: 'Senha numérica incorreta.',
  TOKEN_INVALID: 'Slot/credenciais inválidos após token.',
  EXHAUSTED: 'Falhou após várias tentativas. Relogue manualmente.',
} as const;

import { isIP, Socket } from 'net';
import { MAX_PROXY_LATENCY_MS } from '@shared/proxy-config';
import type { ProxyConnectionStatus } from '@shared/ipc/ipc-api';

const PROXY_LIST_DOWNLOAD_TIMEOUT_MS = 10_000;
const PROXY_TARGET_CONNECT_TIMEOUT_MS = 8_000;
const MAX_PROXY_LIST_BYTES = 1_000_000;
const MAX_PROXY_COUNT = 5_000;

export interface Socks5ProxyEndpoint {
  host: string;
  port: number;
}

export interface Socks5Tunnel {
  socket: Socket;
  proxy: Socks5ProxyEndpoint;
  latencyMs: number;
  release: () => void;
}

interface ProxyTarget {
  host: string;
  port: number;
}

interface ConnectThroughProxyOptions {
  listUrl: string;
  target: ProxyTarget;
  signal: AbortSignal;
  onStatus: (status: ProxyConnectionStatus) => void;
  fetchImpl?: typeof fetch;
  openTunnelImpl?: typeof openSocks5Tunnel;
}

class Socks5ConnectionError extends Error {
  constructor(
    public readonly stage: 'proxy' | 'target',
    message: string,
  ) {
    super(message);
    this.name = 'Socks5ConnectionError';
  }
}

const abortError = (): Error => {
  const error = new Error('Proxy connection cancelled');
  error.name = 'AbortError';
  return error;
};

export const isProxyAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

const formatProxyEndpoint = ({ host, port }: Socks5ProxyEndpoint): string => `${host}:${port}`;

const isPublicIpv4 = (host: string): boolean => {
  if (isIP(host) !== 4) return false;
  const [a, b, c] = host.split('.').map(Number);

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
};

export const parseSocks5ProxyList = (body: string): Socks5ProxyEndpoint[] => {
  const proxies: Socks5ProxyEndpoint[] = [];
  const seen = new Set<string>();

  for (const sourceLine of body.split(/\r?\n/)) {
    if (proxies.length >= MAX_PROXY_COUNT) break;
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;

    try {
      const url = new URL(line.includes('://') ? line : `socks5://${line}`);
      if (url.protocol !== 'socks5:' || url.username || url.password) continue;
      if (url.pathname !== '' || url.search || url.hash) continue;

      const host = url.hostname;
      const port = Number(url.port);
      if (!isPublicIpv4(host) || !Number.isInteger(port) || port < 1 || port > 65_535) {
        continue;
      }

      const key = `${host}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proxies.push({ host, port });
    } catch {
      // Untrusted list entry: skip malformed lines and continue with the pool.
    }
  }

  return proxies;
};

const ipv4Bytes = (host: string): Buffer => Buffer.from(host.split('.').map(Number));

const ipv6Bytes = (host: string): Buffer => {
  let normalized = host;
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const bytes = ipv4Bytes(ipv4Tail);
    normalized =
      normalized.slice(0, -ipv4Tail.length) +
      `${bytes.readUInt16BE(0).toString(16)}:${bytes.readUInt16BE(2).toString(16)}`;
  }

  const [leftRaw, rightRaw = ''] = normalized.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const fill = Array(Math.max(0, 8 - left.length - right.length)).fill('0') as string[];
  const groups = [...left, ...fill, ...right];
  if (groups.length !== 8) throw new Error('Invalid IPv6 target');

  const result = Buffer.alloc(16);
  groups.forEach((group, index) => result.writeUInt16BE(Number.parseInt(group, 16), index * 2));
  return result;
};

const buildConnectRequest = ({ host, port }: ProxyTarget): Buffer => {
  const family = isIP(host);
  let addressType: number;
  let address: Buffer;

  if (family === 4) {
    addressType = 0x01;
    address = ipv4Bytes(host);
  } else if (family === 6) {
    addressType = 0x04;
    address = ipv6Bytes(host);
  } else {
    const encoded = Buffer.from(host, 'utf8');
    if (encoded.length === 0 || encoded.length > 255) throw new Error('Invalid proxy target host');
    addressType = 0x03;
    address = Buffer.concat([Buffer.from([encoded.length]), encoded]);
  }

  const request = Buffer.alloc(4 + address.length + 2);
  request.set([0x05, 0x01, 0x00, addressType], 0);
  address.copy(request, 4);
  request.writeUInt16BE(port, request.length - 2);
  return request;
};

const socksReplyLength = (buffer: Buffer): number | null => {
  if (buffer.length < 4) return null;
  switch (buffer[3]) {
    case 0x01:
      return 10;
    case 0x04:
      return 22;
    case 0x03:
      return buffer.length >= 5 ? 7 + buffer[4] : null;
    default:
      throw new Error('Proxy returned an invalid SOCKS5 address type');
  }
};

export const openSocks5Tunnel = (
  proxy: Socks5ProxyEndpoint,
  target: ProxyTarget,
  signal: AbortSignal,
  proxyTimeoutMs = MAX_PROXY_LATENCY_MS,
  targetTimeoutMs = PROXY_TARGET_CONNECT_TIMEOUT_MS,
): Promise<Socks5Tunnel> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const startedAt = performance.now();
    const socket = new Socket();
    let phase: 'method' | 'connect' = 'method';
    let incoming = Buffer.alloc(0);
    let settled = false;
    let latencyMs: number | null = null;
    let targetTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      clearTimeout(proxyTimer);
      if (targetTimer) clearTimeout(targetTimer);
      signal.removeEventListener('abort', onAbort);
      socket.removeListener('connect', onConnect);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const succeed = (): void => {
      if (settled) return;
      settled = true;
      const measuredLatencyMs = latencyMs ?? Math.ceil(performance.now() - startedAt);
      cleanup();
      // Covers the synchronous hand-off until TcpClient installs its own error listener.
      const handoffErrorGuard = (): void => undefined;
      socket.on('error', handoffErrorGuard);
      resolve({
        socket,
        proxy,
        latencyMs: measuredLatencyMs,
        release: () => socket.removeListener('error', handoffErrorGuard),
      });
    };

    const onAbort = (): void => fail(abortError());
    const currentStage = (): 'proxy' | 'target' => (phase === 'method' ? 'proxy' : 'target');
    const onError = (error: Error): void =>
      fail(new Socks5ConnectionError(currentStage(), error.message));
    const onClose = (): void =>
      fail(new Socks5ConnectionError(currentStage(), 'Proxy closed the SOCKS5 handshake'));
    const onConnect = (): void => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    };
    const onData = (data: Buffer): void => {
      incoming = Buffer.concat([incoming, data]);

      if (phase === 'method') {
        if (incoming.length < 2) return;
        if (incoming[0] !== 0x05 || incoming[1] !== 0x00) {
          fail(new Socks5ConnectionError('proxy', 'Proxy does not allow unauthenticated SOCKS5'));
          return;
        }
        latencyMs = Math.ceil(performance.now() - startedAt);
        clearTimeout(proxyTimer);
        incoming = incoming.subarray(2);
        phase = 'connect';
        targetTimer = setTimeout(
          () =>
            fail(
              new Socks5ConnectionError(
                'target',
                `Proxy could not reach the game server within ${targetTimeoutMs}ms`,
              ),
            ),
          targetTimeoutMs,
        );
        socket.write(buildConnectRequest(target));
      }

      if (phase === 'connect') {
        let replyLength: number | null;
        try {
          replyLength = socksReplyLength(incoming);
        } catch (error) {
          fail(
            new Socks5ConnectionError(
              'target',
              error instanceof Error ? error.message : String(error),
            ),
          );
          return;
        }
        if (replyLength === null || incoming.length < replyLength) return;
        if (incoming[0] !== 0x05 || incoming[1] !== 0x00) {
          fail(
            new Socks5ConnectionError(
              'target',
              `SOCKS5 connection rejected (code ${incoming[1] ?? -1})`,
            ),
          );
          return;
        }
        succeed();
      }
    };

    const proxyTimer = setTimeout(
      () =>
        fail(
          new Socks5ConnectionError(
            'proxy',
            `Proxy exceeded the ${proxyTimeoutMs}ms latency limit`,
          ),
        ),
      proxyTimeoutMs,
    );
    signal.addEventListener('abort', onAbort, { once: true });
    socket.on('connect', onConnect);
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.connect(proxy.port, proxy.host);
  });

const downloadProxyList = async (
  listUrl: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> => {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort(signal.reason);
  const timer = setTimeout(() => controller.abort(), PROXY_LIST_DOWNLOAD_TIMEOUT_MS);
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetchImpl(listUrl, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'text/plain' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_PROXY_LIST_BYTES) throw new Error('Proxy list is too large');

    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_PROXY_LIST_BYTES) {
        try {
          await reader.cancel('Proxy list is too large');
        } catch {
          // Preserve the size-limit failure even if the remote stream rejects cancellation.
        }
        throw new Error('Proxy list is too large');
      }
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, receivedBytes).toString('utf8');
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw new Error(
      `Não foi possível baixar a lista de proxies: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
};

export const connectThroughSocks5List = async ({
  listUrl,
  target,
  signal,
  onStatus,
  fetchImpl = fetch,
  openTunnelImpl = openSocks5Tunnel,
}: ConnectThroughProxyOptions): Promise<Socks5Tunnel> => {
  onStatus({ phase: 'downloading' });
  const body = await downloadProxyList(listUrl, signal, fetchImpl);
  const proxies = parseSocks5ProxyList(body);
  if (proxies.length === 0) throw new Error('A lista não contém proxies SOCKS5 válidos.');
  let responsiveProxyCount = 0;

  for (const [index, proxy] of proxies.entries()) {
    if (signal.aborted) throw abortError();
    onStatus({
      phase: 'testing',
      current: index + 1,
      total: proxies.length,
    });

    let tunnel: Socks5Tunnel | null = null;
    try {
      tunnel = await openTunnelImpl(proxy, target, signal);
      if (tunnel.latencyMs > MAX_PROXY_LATENCY_MS) {
        tunnel.socket.destroy();
        tunnel.release();
        continue;
      }
      onStatus({
        phase: 'connected',
        proxy: formatProxyEndpoint(proxy),
        latencyMs: tunnel.latencyMs,
      });
      return tunnel;
    } catch (error) {
      tunnel?.socket.destroy();
      tunnel?.release();
      if (isProxyAbortError(error)) throw error;
      if (error instanceof Socks5ConnectionError && error.stage === 'target') {
        responsiveProxyCount += 1;
      }
    }
  }

  if (responsiveProxyCount > 0) {
    throw new Error(
      `${responsiveProxyCount} proxy(s) responderam à sua máquina em até ${MAX_PROXY_LATENCY_MS} ms, mas nenhum abriu o túnel até o servidor do jogo.`,
    );
  }
  throw new Error(`Nenhum proxy SOCKS5 respondeu à sua máquina em até ${MAX_PROXY_LATENCY_MS} ms.`);
};

import { createServer, type Server, Socket } from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectThroughSocks5List,
  openSocks5Tunnel,
  parseSocks5ProxyList,
} from '@main/protocol/socks5-proxy';
import { TcpClient } from '@main/protocol/tcp-transport';
import { PacketSecurity } from '@main/protocol/packet-security';
import { INIT_CODE } from '@shared/constants/network-basics';
import { ConnectPayloadSchema } from '@shared/ipc/schemas';

const servers: Server[] = [];
const sockets: Socket[] = [];

const listen = async (server: Server): Promise<number> => {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return address.port;
};

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe('parseSocks5ProxyList', () => {
  it('accepts source formats, deduplicates, and rejects unsafe or malformed endpoints', () => {
    expect(
      parseSocks5ProxyList(`
        socks5://8.8.8.8:1080
        1.1.1.1:4145
        socks5://8.8.8.8:1080
        http://9.9.9.9:8080
        socks5://user:pass@4.4.4.4:1080
        socks5://127.0.0.1:1080
        invalid
      `),
    ).toEqual([
      { host: '8.8.8.8', port: 1080 },
      { host: '1.1.1.1', port: 4145 },
    ]);
  });
});

describe('ConnectPayloadSchema proxy boundary', () => {
  const server = { name: 'Global', ip: '45.90.123.10', port: 8281 };

  it('defaults to direct mode and only accepts HTTPS proxy-list URLs', () => {
    expect(ConnectPayloadSchema.parse({ server }).proxy).toEqual({ enabled: false });
    expect(
      ConnectPayloadSchema.safeParse({
        server,
        proxy: { enabled: true, listUrl: 'https://example.com/proxies.txt' },
      }).success,
    ).toBe(true);
    expect(
      ConnectPayloadSchema.safeParse({
        server,
        proxy: { enabled: true, listUrl: 'http://example.com/proxies.txt' },
      }).success,
    ).toBe(false);
  });
});

describe('openSocks5Tunnel', () => {
  it('performs the no-auth handshake through CONNECT to the game target', async () => {
    let resolveGameData: (data: Buffer) => void = () => undefined;
    const gameData = new Promise<Buffer>((resolve) => {
      resolveGameData = resolve;
    });
    const server = createServer((socket) => {
      sockets.push(socket);
      socket.once('data', (greeting) => {
        expect([...greeting]).toEqual([0x05, 0x01, 0x00]);
        socket.write(Buffer.from([0x05, 0x00]));
        socket.once('data', (request) => {
          const requestBuffer = Buffer.from(request);
          expect([...requestBuffer.subarray(0, 4)]).toEqual([0x05, 0x01, 0x00, 0x01]);
          expect([...requestBuffer.subarray(4, 8)]).toEqual([45, 90, 123, 10]);
          expect(requestBuffer.readUInt16BE(8)).toBe(8281);
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.once('data', (data) => resolveGameData(Buffer.from(data)));
        });
      });
    });
    const port = await listen(server);
    const tunnel = await openSocks5Tunnel(
      { host: '127.0.0.1', port },
      { host: '45.90.123.10', port: 8281 },
      new AbortController().signal,
      200,
    );

    expect(tunnel.socket.destroyed).toBe(false);
    expect(tunnel.latencyMs).toBeLessThanOrEqual(200);

    const client = new TcpClient(
      '45.90.123.10',
      8281,
      new PacketSecurity(),
      'test-proxy',
      tunnel.socket,
    );
    client.connect();
    tunnel.release();
    const initCode = await gameData;
    expect(initCode.readInt32LE(0)).toBe(INIT_CODE);
    client.disconnect();
  });

  it('rejects a proxy that does not finish within the latency ceiling', async () => {
    const port = await listen(
      createServer((socket) => {
        sockets.push(socket);
      }),
    );

    await expect(
      openSocks5Tunnel(
        { host: '127.0.0.1', port },
        { host: '45.90.123.10', port: 8281 },
        new AbortController().signal,
        20,
      ),
    ).rejects.toThrow('20ms latency limit');
  });

  it('applies the 400ms-style ceiling only to this machine -> proxy, not proxy -> target', async () => {
    const server = createServer((socket) => {
      sockets.push(socket);
      socket.once('data', () => {
        socket.write(Buffer.from([0x05, 0x00]));
        socket.once('data', () => {
          setTimeout(() => {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          }, 150);
        });
      });
    });
    const port = await listen(server);

    const tunnel = await openSocks5Tunnel(
      { host: '127.0.0.1', port },
      { host: '45.90.123.10', port: 8281 },
      new AbortController().signal,
      100,
      300,
    );

    expect(tunnel.latencyMs).toBeLessThanOrEqual(100);
    tunnel.socket.destroy();
    tunnel.release();
  });
});

describe('connectThroughSocks5List', () => {
  it('cancels the response stream as soon as the proxy list exceeds 1 MB', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600_000));
        controller.enqueue(new Uint8Array(600_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn(
      async () => new Response(body, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      connectThroughSocks5List({
        listUrl: 'https://example.com/proxies.txt',
        target: { host: '45.90.123.10', port: 8281 },
        signal: new AbortController().signal,
        onStatus: vi.fn(),
        fetchImpl,
      }),
    ).rejects.toThrow('Proxy list is too large');
    expect(cancelled).toBe(true);
  });

  it('tries sequentially and discards a tunnel above 400ms before selecting the next one', async () => {
    const statuses: unknown[] = [];
    const slowSocket = new Socket();
    const selectedSocket = new Socket();
    const openTunnelImpl = vi
      .fn()
      .mockResolvedValueOnce({
        socket: slowSocket,
        proxy: { host: '8.8.8.8', port: 1080 },
        latencyMs: 401,
        release: vi.fn(),
      })
      .mockResolvedValueOnce({
        socket: selectedSocket,
        proxy: { host: '1.1.1.1', port: 4145 },
        latencyMs: 120,
        release: vi.fn(),
      });
    const fetchImpl = vi.fn(
      async () => new Response('socks5://8.8.8.8:1080\n1.1.1.1:4145\n', { status: 200 }),
    ) as unknown as typeof fetch;

    const tunnel = await connectThroughSocks5List({
      listUrl: 'https://example.com/proxies.txt',
      target: { host: '45.90.123.10', port: 8281 },
      signal: new AbortController().signal,
      onStatus: (status) => statuses.push(status),
      fetchImpl,
      openTunnelImpl,
    });

    expect(openTunnelImpl).toHaveBeenCalledTimes(2);
    expect(slowSocket.destroyed).toBe(true);
    expect(tunnel.socket).toBe(selectedSocket);
    expect(statuses).toContainEqual({
      phase: 'connected',
      proxy: '1.1.1.1:4145',
      latencyMs: 120,
    });
    selectedSocket.destroy();
  });
});

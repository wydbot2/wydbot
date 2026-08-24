// TcpClient.send() must advance the Phase-1 hash counter ONLY when the packet is actually
// written to the socket — never on a drop (destroyed socket / backpressure).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TcpClient } from '../../../src/main/protocol/tcp-transport';
import { PacketSecurity } from '../../../src/main/protocol/packet-security';

const HASH_TABLE = new Uint8Array([
  0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0, 0x01,
]);

// BACKPRESSURE_THRESHOLD in tcp-transport.ts is 65_536 (not exported).
const OVER_BACKPRESSURE = 70_000;

const mockSocket = (writableLength: number, destroyed: boolean) => ({
  writableLength,
  destroyed,
  write: vi.fn(),
});

/** A minimal >=12-byte packet (size field set) so send() runs the encrypt+advance block. */
const makePacket = (): Buffer => {
  const buf = Buffer.alloc(16);
  buf.writeUInt16LE(16, 0);
  return buf;
};

describe('TcpClient.send — Phase-1 counter advances only on a real write', () => {
  let security: PacketSecurity;
  let client: TcpClient;

  beforeEach(() => {
    security = new PacketSecurity();
    security.setHashTable(HASH_TABLE);
    client = new TcpClient('127.0.0.1', 8281, security);
  });

  it('advances the counter and writes when the socket is healthy', () => {
    const socket = mockSocket(0, false);
    (client as unknown as { socket: unknown }).socket = socket;
    const advance = vi.spyOn(security, 'advanceHashByte');

    client.send(makePacket());

    expect(socket.write).toHaveBeenCalledTimes(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('does NOT advance when backpressure drops the packet', () => {
    const socket = mockSocket(OVER_BACKPRESSURE, false);
    (client as unknown as { socket: unknown }).socket = socket;
    const advance = vi.spyOn(security, 'advanceHashByte');

    client.send(makePacket());

    expect(socket.write).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });

  it('does NOT advance when the socket is destroyed', () => {
    const socket = mockSocket(0, true);
    (client as unknown as { socket: unknown }).socket = socket;
    const advance = vi.spyOn(security, 'advanceHashByte');

    client.send(makePacket());

    expect(socket.write).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
  });
});

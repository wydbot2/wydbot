import { Socket } from 'net';
import { EventEmitter } from 'events';
import { INIT_CODE, MAX_PACKET_LENGTH } from '@shared/constants/network-basics';
import { PACKET_HEADER_SIZE } from '@shared/types/game-structures';
import type { PacketSecurity } from './packet-security';
import { protocolLogger } from '../logging';

export interface TcpClientEvents {
  connected: [];
  disconnected: [];
  error: [error: Error];
  packet: [opcode: number, buffer: Buffer];
  protocolWarning: [message: string];
}

/** Drop outgoing packets when socket write buffer exceeds this threshold (mirrors original 128KB / 2). */
const BACKPRESSURE_THRESHOLD = 65_536;

export class TcpClient extends EventEmitter<TcpClientEvents> {
  private socket: Socket | null = null;
  private preparedSocket: Socket | null;
  private recvBuffer = Buffer.alloc(0);
  private _lastSendTime = 0;
  private _lastRecvTime = 0;
  private _sendCount = 0;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly security: PacketSecurity,
    private readonly logTag: string = '',
    preparedSocket: Socket | null = null,
  ) {
    super();
    this.preparedSocket = preparedSocket;
  }

  public get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  public get lastSendTime(): number {
    return this._lastSendTime;
  }

  public connect(): void {
    if (this.socket) {
      this.socket.destroy();
    }

    this.recvBuffer = Buffer.alloc(0);
    const preparedSocket = this.preparedSocket;
    this.preparedSocket = null;
    this.socket = preparedSocket ?? new Socket();
    const socket = this.socket;

    protocolLogger.info(this.tag(`Connecting to ${this.host}:${this.port}...`));

    const onConnected = (): void => {
      protocolLogger.info(this.tag(`Socket connected to ${this.host}:${this.port}`));
      this.sendInitCode();
    };

    socket.on('connect', onConnected);

    socket.on('data', (data: Buffer) => {
      this.onData(data);
    });

    socket.on('error', (err: Error) => {
      protocolLogger.error(this.tag(`Socket error: ${err.message}`));
      this.emit('error', err);
    });

    socket.on('close', (hadError) => {
      const now = Date.now();
      const sinceSend = this._lastSendTime ? now - this._lastSendTime : -1;
      const sinceRecv = this._lastRecvTime ? now - this._lastRecvTime : -1;
      protocolLogger.info(
        this.tag(
          `Connection closed (hadError: ${hadError}) totalSent=${this._sendCount} sinceSend=${sinceSend}ms sinceRecv=${sinceRecv}ms`,
        ),
      );
      this.emit('disconnected');
    });

    socket.on('timeout', () => {
      protocolLogger.warn(this.tag('Socket timeout'));
      this.socket?.destroy();
    });

    socket.setTimeout(15_000);
    // OS-level TCP keepalive keeps the NAT binding alive — layer 4 only, it does
    // NOT reset the server's ~370s application-level idle timer. The app-level
    // keepalive that prevents the idle FIN is the 0x3A0 packet from the KeepAlive
    // timer (mirrors game — see session/keep-alive.ts).
    socket.setKeepAlive(true, 25_000);
    if (preparedSocket) {
      // The SOCKS5 selector already opened and validated this tunnel. Reusing it
      // avoids a second dial between "proxy approved" and the actual WYD login.
      onConnected();
    } else {
      socket.connect(this.port, this.host);
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  public send(buffer: Buffer): void {
    if (!this.socket || this.socket.destroyed) {
      protocolLogger.warn('send() called but socket is destroyed/null');
      this.emit('protocolWarning', 'send() called but socket is destroyed/null');
      return;
    }

    // F5: TCP backpressure — drop packet when write buffer is congested
    if (this.socket.writableLength > BACKPRESSURE_THRESHOLD) {
      protocolLogger.warn(
        `Backpressure: dropping packet (writableLength=${this.socket.writableLength} > ${BACKPRESSURE_THRESHOLD})`,
      );
      return;
    }

    // Log outgoing packet BEFORE encryption (opcode + hash byte are readable)
    if (buffer.length >= PACKET_HEADER_SIZE) {
      const opcode = buffer.readUInt16LE(4);
      const hashByte = buffer[2];
      this._sendCount++;
      protocolLogger.debug(
        `#${this._sendCount} opcode=0x${opcode.toString(16).toUpperCase()} size=${buffer.length} hashByte=0x${hashByte.toString(16).toUpperCase()}`,
      );
      this.security.encrypt(buffer);
      this.security.advanceHashByte();
    }

    this.socket.write(buffer);
    this._lastSendTime = Date.now();
  }

  private tag(message: string): string {
    return this.logTag ? `${message} [${this.logTag}]` : message;
  }

  private sendInitCode(): void {
    if (!this.socket) return;

    const buf = Buffer.alloc(4);
    buf.writeInt32LE(INIT_CODE, 0);
    this.socket.write(buf);
    this.emit('connected');
  }

  private onData(data: Buffer): void {
    this._lastRecvTime = Date.now();
    this.recvBuffer = Buffer.concat([this.recvBuffer, data]);

    while (this.recvBuffer.length >= PACKET_HEADER_SIZE) {
      const packetSize = this.recvBuffer.readUInt16LE(0);

      if (packetSize < PACKET_HEADER_SIZE || packetSize > MAX_PACKET_LENGTH) {
        const msg = `Invalid packet size: ${packetSize} (min: ${PACKET_HEADER_SIZE}, max: ${MAX_PACKET_LENGTH}). Discarding ${this.recvBuffer.length} bytes.`;
        protocolLogger.warn(msg);
        this.emit('protocolWarning', msg);
        this.recvBuffer = Buffer.alloc(0);
        break;
      }

      if (this.recvBuffer.length < packetSize) break;

      const packetBuffer = Buffer.from(this.recvBuffer.subarray(0, packetSize));
      this.recvBuffer = Buffer.from(this.recvBuffer.subarray(packetSize));

      const checksumOk = this.security.decrypt(packetBuffer);
      if (!checksumOk) {
        const opcode = packetBuffer.readUInt16LE(4);
        const msg = `Checksum mismatch on packet opcode=0x${opcode.toString(16).toUpperCase()}, size=${packetSize}`;
        protocolLogger.warn(msg);
        this.emit('protocolWarning', msg);
        continue;
      }

      const opcode = packetBuffer.readUInt16LE(4);
      this.emit('packet', opcode, packetBuffer);
    }
  }
}

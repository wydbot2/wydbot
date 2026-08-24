/**
 * LIFECYCLE: Session state container
 *
 * Owns the ClientConnection + ClientControl + ActionQueue triple.
 * Created once at app startup, survives window recreation.
 *
 *   createConnection()    → allocates connection/control pair
 *   onCharEnteredWorld()  → configures session after login
 *   cleanup()             → tears down everything
 */
import type { Socket } from 'net';
import { ClientConnection, ClientControl } from '@main/protocol';
import type { ParsedCharToWorld } from '@main/protocol';
import { ActionQueue } from './action-queue';
import { KeepAlive } from './keep-alive';
import { MovementState } from './movement-state';

export class SessionManager {
  private connection: ClientConnection | null = null;
  private control: ClientControl | null = null;
  private actionQueue: ActionQueue | null = null;
  private keepAlive: KeepAlive | null = null;
  private _movementState: MovementState | null = null;
  private _playerMobIndex: number | null = null;
  private _clientId = 0;
  private cleaning = false;
  private connectionAttempt: AbortController | null = null;

  public get playerMobIndex(): number | null {
    return this._playerMobIndex;
  }

  public set playerMobIndex(value: number | null) {
    this._playerMobIndex = value;
  }

  public get clientId(): number {
    return this._clientId;
  }

  public set clientId(value: number) {
    this._clientId = value;
  }

  public createConnection(
    ip: string,
    port: number,
    logTag = '',
    preparedSocket: Socket | null = null,
    attempt: AbortController | null = null,
  ): { connection: ClientConnection; control: ClientControl } {
    if (attempt && (this.connectionAttempt !== attempt || attempt.signal.aborted)) {
      preparedSocket?.destroy();
      throw new Error('Stale connection attempt');
    }
    if (attempt) this.connectionAttempt = null;
    this.cleanup();
    this.connection = new ClientConnection(ip, port, logTag, preparedSocket);
    this._movementState = new MovementState();
    this.control = new ClientControl(this.connection, this._movementState);
    return { connection: this.connection, control: this.control };
  }

  public cleanup(): void {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      this.connectionAttempt?.abort();
      this.connectionAttempt = null;
      if (this.keepAlive) {
        this.keepAlive.stop();
        this.keepAlive = null;
      }
      if (this.actionQueue) {
        this.actionQueue.stop();
        this.actionQueue = null;
      }
      if (this.connection) {
        this.connection.disconnect();
        this.connection.removeAllListeners();
        this.connection = null;
      }
      this.control = null;
      this._movementState = null;
      this._playerMobIndex = null;
      this._clientId = 0;
    } finally {
      this.cleaning = false;
    }
  }

  public beginConnectionAttempt(): AbortController {
    this.connectionAttempt?.abort();
    const attempt = new AbortController();
    this.connectionAttempt = attempt;
    return attempt;
  }

  public endConnectionAttempt(attempt: AbortController): void {
    if (this.connectionAttempt === attempt) this.connectionAttempt = null;
  }

  public getControl(): ClientControl | null {
    return this.control;
  }

  public getMovementState(): MovementState | null {
    return this._movementState;
  }

  public getConnection(): ClientConnection | null {
    return this.connection;
  }

  public createActionQueue(): ActionQueue | null {
    if (!this.control || !this.connection) return null;
    this.actionQueue = new ActionQueue(this.control);
    return this.actionQueue;
  }

  public getActionQueue(): ActionQueue | null {
    return this.actionQueue;
  }

  /**
   * Applies all session-state side-effects when the player character enters the world.
   * Called by ipc-event-bridge after charToWorld is received — keeps bridge focused
   * on translation/forwarding only.
   */
  public onCharEnteredWorld(
    parsed: ParsedCharToWorld,
    connection: ClientConnection,
    control: ClientControl,
  ): void {
    if (parsed.header.clientId) control.setClientId(parsed.header.clientId);
    this._playerMobIndex = parsed.mobIndex;
    control.setMobIndex(parsed.mobIndex);
    control.setSelfName(parsed.name);
    this._movementState?.setCharToWorld(parsed.position);
    // Store evolution tier for 0xBBF challenge-response algorithm 0x13BD
    connection.setEvolutionTier(parsed.evolutionTier);
    const queue = this.createActionQueue();
    if (queue) queue.start();
    // Idle keepalive while in-world; stop any prior timer so re-entry can't orphan it.
    this.keepAlive?.stop();
    this.keepAlive = new KeepAlive(connection, control);
    this.keepAlive.start();
  }
}

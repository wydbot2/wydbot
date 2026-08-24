import type { BrowserWindow } from 'electron';
import type { SessionManager } from '@main/session';
import type { IpcSendFn } from '@main/ipc/ipc-types';

/** A live game-client window with its own isolated session + outbound channel. */
export interface GameWindow {
  readonly windowId: number;
  readonly win: BrowserWindow;
  readonly session: SessionManager;
  readonly send: IpcSendFn;
  stopBroadcaster: (() => void) | null;
}

/** Per-window IPC context resolved from an inbound event's sender. */
export interface SessionCtx {
  readonly session: SessionManager;
  readonly send: IpcSendFn;
}

/**
 * Source of truth for live game windows. Keyed by webContents id —
 * the same id Electron stamps on every inbound IPC event sender, so resolving the
 * owning session of a command is a direct lookup.
 */
export class WindowRegistry {
  private readonly windows = new Map<number, GameWindow>();

  public get size(): number {
    return this.windows.size;
  }

  public add(entry: GameWindow): void {
    this.windows.set(entry.windowId, entry);
  }

  /** Remove and return the entry; idempotent (null when already gone). */
  public release(windowId: number): GameWindow | null {
    const entry = this.windows.get(windowId) ?? null;
    if (entry) this.windows.delete(windowId);
    return entry;
  }

  /** Resolve the session + outbound channel owning an inbound event sender. */
  public contextForSender(senderId: number): SessionCtx | null {
    const entry = this.windows.get(senderId);
    return entry ? { session: entry.session, send: entry.send } : null;
  }

  public forEach(fn: (entry: GameWindow) => void): void {
    for (const entry of this.windows.values()) fn(entry);
  }

  /** A live window for app-wide emitters (e.g. logs) — focused if any. */
  public focusedWindow(): BrowserWindow | null {
    let fallback: BrowserWindow | null = null;
    for (const { win } of this.windows.values()) {
      if (win.isDestroyed()) continue;
      if (win.isFocused()) return win;
      fallback ??= win;
    }
    return fallback;
  }
}

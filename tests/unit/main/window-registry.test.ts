import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { SessionManager } from '@main/session';
import type { IpcSendFn } from '@main/ipc/ipc-types';
import { WindowRegistry, type GameWindow } from '@main/window-registry';

const entry = (
  windowId: number,
  opts?: { focused?: boolean; destroyed?: boolean },
): GameWindow => ({
  windowId,
  win: {
    isDestroyed: () => opts?.destroyed ?? false,
    isFocused: () => opts?.focused ?? false,
  } as unknown as BrowserWindow,
  session: { cleanup: vi.fn() } as unknown as SessionManager,
  send: vi.fn() as unknown as IpcSendFn,
  stopBroadcaster: null,
});

describe('WindowRegistry', () => {
  it('release removes the entry and is idempotent', () => {
    const r = new WindowRegistry();
    r.add(entry(1));
    expect(r.size).toBe(1);
    expect(r.release(1)).not.toBeNull();
    expect(r.release(1)).toBeNull();
    expect(r.size).toBe(0);
  });

  it('resolves the owning session+send by sender id, null for unknown', () => {
    const r = new WindowRegistry();
    const a = entry(1);
    const b = entry(2);
    r.add(a);
    r.add(b);
    expect(r.contextForSender(1)?.session).toBe(a.session);
    expect(r.contextForSender(2)?.send).toBe(b.send);
    expect(r.contextForSender(99)).toBeNull();
  });

  it('focusedWindow prefers the focused live window', () => {
    const r = new WindowRegistry();
    const a = entry(1, { focused: false });
    const b = entry(2, { focused: true });
    r.add(a);
    r.add(b);
    expect(r.focusedWindow()).toBe(b.win);
  });

  it('focusedWindow skips destroyed windows and falls back to the first live one', () => {
    const r = new WindowRegistry();
    const a = entry(1, { destroyed: true });
    const b = entry(2, { focused: false });
    r.add(a);
    r.add(b);
    expect(r.focusedWindow()).toBe(b.win);
  });
});

/**
 * Unit tests for `ctx.memory` — the session-wide key/value store shared by
 * macro scripts (src/renderer/lib/script-memory.ts) and its QuickJS wiring
 * in `buildCtxHandle` (src/renderer/lib/script-ctx.ts).
 *
 * Two layers:
 *  1. Store + `isMemoryValue` guard (pure, no QuickJS).
 *  2. Integration through the real runtime: two separate `runScript` calls
 *     share the same memory; invalid values log a pt-BR error and no-op.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearMemoryValues,
  deleteMemoryValue,
  getMemoryValue,
  isMemoryValue,
  setMemoryValue,
} from '@renderer/lib/script-memory';
import { buildCtxHandle } from '@renderer/lib/script-ctx';
import { runScript } from '@renderer/lib/script-runtime';

beforeEach(() => {
  clearMemoryValues();
});

describe('script-memory store', () => {
  it('set/get/delete round-trip', () => {
    expect(getMemoryValue('voltas')).toBeUndefined();

    setMemoryValue('voltas', 3);
    expect(getMemoryValue('voltas')).toBe(3);

    setMemoryValue('cidade', 'Armia');
    expect(getMemoryValue('cidade')).toBe('Armia');

    deleteMemoryValue('voltas');
    expect(getMemoryValue('voltas')).toBeUndefined();
    expect(getMemoryValue('cidade')).toBe('Armia');
  });

  it('set overwrites a previous value under the same key', () => {
    setMemoryValue('k', 1);
    setMemoryValue('k', 2);
    expect(getMemoryValue('k')).toBe(2);
  });

  it('clear wipes the whole store', () => {
    setMemoryValue('a', 1);
    setMemoryValue('b', 2);
    clearMemoryValues();
    expect(getMemoryValue('a')).toBeUndefined();
    expect(getMemoryValue('b')).toBeUndefined();
  });
});

describe('isMemoryValue', () => {
  it.each([null, true, false, 0, 3.14, '', 'texto'])('accepts primitive %p', (v) => {
    expect(isMemoryValue(v)).toBe(true);
  });

  it('accepts nested plain objects and arrays', () => {
    expect(isMemoryValue({ a: [1, 'x', { b: null }], c: [] })).toBe(true);
    expect(isMemoryValue([])).toBe(true);
    expect(isMemoryValue({})).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite number %p', (v) => {
    expect(isMemoryValue(v)).toBe(false);
  });

  it.each([undefined, Symbol('s'), 10n, () => 1])('rejects non-JSON %p', (v) => {
    expect(isMemoryValue(v)).toBe(false);
  });

  it('rejects class instances and builtin containers', () => {
    expect(isMemoryValue(new Map())).toBe(false);
    expect(isMemoryValue(new Set())).toBe(false);
    expect(isMemoryValue(new Date())).toBe(false);
  });

  it('rejects reference cycles', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(isMemoryValue(cyclic)).toBe(false);

    const inner: unknown[] = [];
    const outer = { inner };
    inner.push(outer);
    expect(isMemoryValue(outer)).toBe(false);
  });
});

describe('ctx.memory via runScript', () => {
  it('shares values across separate script runs', async () => {
    await runScript(`ctx.memory.set('voltas', 41);`, (qctx) => buildCtxHandle(qctx));
    const read = await runScript(
      `const v = (ctx.memory.get('voltas') ?? 0) + 1; ctx.memory.set('voltas', v); return v;`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(read).toBe(42);
    expect(getMemoryValue('voltas')).toBe(42);
  });

  it('get on a missing key returns undefined', async () => {
    const result = await runScript(`return ctx.memory.get('nuncaGravada') === undefined;`, (qctx) =>
      buildCtxHandle(qctx),
    );
    expect(result).toBe(true);
  });

  it('round-trips nested objects and arrays', async () => {
    const result = await runScript(
      `ctx.memory.set('rota', { cidade: 'Armia', pontos: [{ x: 1, y: 2 }, { x: 3, y: 4 }], ativa: true });
       return ctx.memory.get('rota');`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(result).toEqual({
      cidade: 'Armia',
      pontos: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      ativa: true,
    });
  });

  it('delete works from inside the guest', async () => {
    const result = await runScript(
      `ctx.memory.set('a', 1);
       ctx.memory.delete('a');
       return ctx.memory.get('a') === undefined;`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(result).toBe(true);
  });

  it('round-trips falsy values (0, false, "", null)', async () => {
    const result = await runScript(
      `ctx.memory.set('z', 0); ctx.memory.set('f', false); ctx.memory.set('e', ''); ctx.memory.set('n', null);
       return [ctx.memory.get('z'), ctx.memory.get('f'), ctx.memory.get('e'), ctx.memory.get('n')];`,
      (qctx) => buildCtxHandle(qctx),
    );
    expect(result).toEqual([0, false, '', null]);
  });

  it('set with a guest-side circular value logs a pt-BR error and does not store', async () => {
    const log = vi.fn();
    await runScript(
      `const ciclico = {}; ciclico.eu = ciclico; ctx.memory.set('cic', ciclico);`,
      (qctx) => buildCtxHandle(qctx, { log }),
    );
    expect(getMemoryValue('cic')).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'error',
      '[script] memory.set: valor inválido (referência circular)',
    );
  });

  it('set with a non-serializable value logs a pt-BR error and does not store', async () => {
    const log = vi.fn();
    await runScript(`ctx.memory.set('fn', () => 1); ctx.memory.set('nan', NaN);`, (qctx) =>
      buildCtxHandle(qctx, { log }),
    );
    expect(getMemoryValue('fn')).toBeUndefined();
    expect(getMemoryValue('nan')).toBeUndefined();
    const errors = log.mock.calls.filter(([level]) => level === 'error').map(([, msg]) => msg);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('[script] memory.set:');
  });

  it('non-string key logs a pt-BR error and does not store', async () => {
    const log = vi.fn();
    await runScript(`ctx.memory.set(123, 'x');`, (qctx) => buildCtxHandle(qctx, { log }));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('error', '[script] memory.set: chave deve ser string');
  });
});

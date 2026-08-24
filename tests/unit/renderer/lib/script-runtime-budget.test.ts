/**
 * Unit tests for the execution-budget pause in `runScript`
 * (src/renderer/lib/script-runtime.ts).
 *
 * A blocking host function (e.g. `ctx.alert`, which waits for a human click)
 * must not count its wait against the wall-clock timeout. `BudgetControls`
 * excludes it. These drive the real QuickJS runtime with a host `block(ms)`
 * function to prove a long host await survives a short budget, and that the
 * timeout still bites a pure-JS runaway loop.
 *
 * Note: QuickJS polls its interrupt handler periodically (on loop back-edges /
 * call boundaries), not per instruction, so trivial post-await code escapes the
 * timeout regardless — the pause matters when real work follows the await.
 */
import { describe, it, expect } from 'vitest';
import { type QuickJSAsyncContext } from 'quickjs-emscripten';
import {
  runScript,
  type BudgetControls,
  type CtxBuilder,
} from '../../../../src/renderer/lib/script-runtime';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Exposes `ctx.block(ms)` — a host await of `ms` excluded from the execution budget. */
const blockCtxBuilder: CtxBuilder = (qctx: QuickJSAsyncContext, budget: BudgetControls) => {
  const obj = qctx.newObject();
  const blockFn = qctx.newFunction('block', (msH) => {
    const ms = qctx.getNumber(msH);
    budget.pause();
    const host = delay(ms).then(() => {
      budget.resume();
      return qctx.undefined;
    });
    const deferred = qctx.newPromise(host);
    void deferred.settled.then(() => qctx.runtime.executePendingJobs());
    return deferred.handle;
  });
  qctx.setProp(obj, 'block', blockFn);
  blockFn.dispose();
  return obj;
};

describe('runScript budget exclusion', () => {
  it('a host await longer than the timeout completes when excluded from the budget', async () => {
    const result = await runScript('await ctx.block(120); return 7;', blockCtxBuilder, {
      timeoutMs: 50,
    });
    expect(result).toBe(7);
  });

  it('pure-JS work past the timeout still trips even with the pause available', async () => {
    await expect(
      runScript('while (true) {}', blockCtxBuilder, {
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });
});

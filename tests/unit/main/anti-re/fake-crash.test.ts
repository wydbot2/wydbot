import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  resetFakeCrashForTests,
  triggerFakeCrash,
  DetectionVector,
} from '@main/anti-re/fake-crash';

// Mock process terminators to throw so execution stops (mirrors production
// where exit/abort/crash never return). This prevents the fallback exit in the
// setTimeout from double-counting.
let exitCalls = 0;
let abortCalls = 0;
let crashCalls = 0;
let stderrChunks: string[] = [];

vi.stubGlobal('process', {
  ...process,
  exit: () => {
    exitCalls++;
    throw new Error('__terminated__');
  },
  abort: () => {
    abortCalls++;
    throw new Error('__terminated__');
  },
  crash: () => {
    crashCalls++;
    throw new Error('__terminated__');
  },
  stderr: {
    ...process.stderr,
    write: (chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    },
  },
});

describe('fake-crash', () => {
  beforeEach(() => {
    resetFakeCrashForTests();
    exitCalls = 0;
    abortCalls = 0;
    crashCalls = 0;
    stderrChunks = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is single-shot: the second triggerFakeCrash is a no-op', () => {
    triggerFakeCrash(DetectionVector.ARGV_GATE);
    triggerFakeCrash(DetectionVector.DEBUGGER_DETACH);

    vi.advanceTimersByTime(1000);

    const totalTerminations = exitCalls + abortCalls + crashCalls;
    expect(totalTerminations).toBe(1);
  });

  it('writes coded telemetry to stderr before terminating', () => {
    triggerFakeCrash(DetectionVector.ARGV_GATE);
    vi.advanceTimersByTime(1000);

    const combined = stderrChunks.join('');
    expect(combined).toContain('evt=rf');
    expect(combined).toContain('v=1');
    expect(combined).not.toContain('devtools');
    expect(combined).not.toContain('debugger');
  });

  it('terminates via exactly one of: exit, abort, or crash', () => {
    triggerFakeCrash(DetectionVector.CONSOLE_TRAP);
    vi.advanceTimersByTime(1000);

    const totalTerminations = exitCalls + abortCalls + crashCalls;
    expect(totalTerminations).toBe(1);
  });

  it('rotates: no two consecutive draws pick the same variant', () => {
    const seenVariants: string[] = [];

    for (let i = 0; i < 50; i++) {
      resetFakeCrashForTests();
      stderrChunks = [];
      exitCalls = 0;
      abortCalls = 0;
      crashCalls = 0;

      triggerFakeCrash(DetectionVector.TIMING_TRAP);
      vi.advanceTimersByTime(1000);

      const match = stderrChunks.join('').match(/k=(\d)/);
      if (match) seenVariants.push(match[1]);
    }

    // Over 50 draws, at least 3 different variants should appear.
    expect(new Set(seenVariants).size).toBeGreaterThanOrEqual(3);

    // No consecutive duplicates (rotation invariant).
    for (let i = 1; i < seenVariants.length; i++) {
      expect(seenVariants[i]).not.toBe(seenVariants[i - 1]);
    }
  });

  it('delays the crash by 100-800ms (not immediate)', () => {
    triggerFakeCrash(DetectionVector.ARGV_GATE);

    vi.advanceTimersByTime(50);
    expect(exitCalls + abortCalls + crashCalls).toBe(0);

    vi.advanceTimersByTime(850);
    expect(exitCalls + abortCalls + crashCalls).toBe(1);
  });
});

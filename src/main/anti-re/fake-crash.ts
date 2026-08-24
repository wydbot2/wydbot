import { randomInt } from 'node:crypto';
import { DetectionVector, FakeCrashVariant } from './types';
import type { DetectionVectorCode, FakeCrashVariantCode } from './types';

const VARIANT_COUNT = 5;

let triggered = false;
let lastIndex = -1;

const pickVariant = (): FakeCrashVariantCode => {
  let next = randomInt(0, VARIANT_COUNT);
  while (next === lastIndex) next = randomInt(0, VARIANT_COUNT);
  lastIndex = next;
  return next as FakeCrashVariantCode;
};

const writeCodedLog = (variant: FakeCrashVariantCode, vector: DetectionVectorCode): void => {
  try {
    process.stderr.write(`runtime.lifecycle evt=rf k=${variant} v=${vector}\n`);
  } catch {
    // stderr unavailable
  }
};

const SEP = '\\';

const emitEconnreset = (): void => {
  process.stderr.write(
    [
      '',
      'node:internal/stream_base_commons:217',
      '  const errorHandlingStateMachine = ...',
      '                                ^',
      'Error: read ECONNRESET',
      '    at TCP.onStreamRead (node:internal/stream_base_commons:217:20)',
      '    at Socket.read (node:net:608:27)',
      '    at TCP.value (node:net:1809:18)',
      '',
    ].join('\n'),
  );
  process.exit(1);
};

const emitHeapOom = (): void => {
  process.stderr.write(
    [
      '',
      '<--- Last few GCs --->',
      '',
      '[1:0x7ff6a1f00]  234567 ms: Mark-Compact 467.2 (490.1) -> 467.2 (490.1) MB, 312.5 / 316.5 ms  (average mu = 0.123, current mu = 0.012) finalize incremental marking through...',
      '',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      '----- Native stack trace -----',
      '',
      ' 1: 00007FF6A123BC26',
      ' 2: 00007FF6A1DEF050',
      ' 3: 00007FF6A2F011A2',
      ' 4: 00007FF6A2F03970',
      ' 5: 00007FF6A3041880',
      ' 6: 00007FF6A3046C77',
      ' 7: 00007FF6A3046A7E',
      '',
    ].join('\n'),
  );
  process.abort();
};

const emitNativeCrash = (): void => {
  process.crash();
};

const emitEnotfound = (): void => {
  process.stderr.write(
    [
      '',
      'node:dns:109',
      '  const err = new ErrnoException(getaddrinfo, ...)',
      '              ^',
      'Error: getaddrinfo ENOTFOUND update.wydbot.com',
      '    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:109:26)',
      '    at GetAddrInfoReqWrap.callbackTrampoline (node:internal/async_hooks:130:17)',
      `    at Object.<anonymous> (...${SEP}app.asar${SEP}out${SEP}main${SEP}index.cjs:1:8432)`,
      '',
    ].join('\n'),
  );
  process.exit(1);
};

const emitStackOverflow = (): void => {
  const frame = `    at Object.<anonymous> (...${SEP}app.asar${SEP}out${SEP}main${SEP}index.cjs:1:8432)`;
  process.stderr.write(
    [
      '',
      'RangeError: Maximum call stack size exceeded',
      ...Array.from({ length: 14 }, () => frame),
      '',
    ].join('\n'),
  );
  process.exit(1);
};

const EMITTERS: ReadonlyArray<() => void> = [
  emitEconnreset,
  emitHeapOom,
  emitNativeCrash,
  emitEnotfound,
  emitStackOverflow,
];

export const triggerFakeCrash = (vector: DetectionVectorCode): void => {
  if (triggered) return;
  triggered = true;

  const variant = pickVariant();
  writeCodedLog(variant, vector);

  const delay = 100 + randomInt(0, 700);
  setTimeout(() => {
    try {
      EMITTERS[variant]();
      process.exit(1);
    } catch {
      // exit/abort/crash are mocked in tests
    }
  }, delay);
};

export const resetFakeCrashForTests = (): void => {
  triggered = false;
};

export { DetectionVector, FakeCrashVariant };

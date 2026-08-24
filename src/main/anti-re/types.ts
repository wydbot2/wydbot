export const DetectionVector = {
  ARGV_GATE: 1,
  DEBUGGER_DETACH: 2,
  DEVTOOLS_OPENED: 3,
  CONSOLE_TRAP: 4,
  TIMING_TRAP: 5,
  AGENT_AUTOMATION: 6,
} as const;

export type DetectionVectorCode = (typeof DetectionVector)[keyof typeof DetectionVector];

export const FakeCrashVariant = {
  ECONNRESET: 0,
  HEAP_OOM: 1,
  NATIVE_CRASH: 2,
  ENOTFOUND: 3,
  STACK_OVERFLOW: 4,
} as const;

export type FakeCrashVariantCode = (typeof FakeCrashVariant)[keyof typeof FakeCrashVariant];

import type { MacroStepConfig } from '@shared/app-config';

/** Runtime step shape — same as the persisted schema. The engine executes every kind. */
export type MacroStep = MacroStepConfig;

export type MacroStepKind = MacroStep['kind'];

export type WalkMode = 'exact' | 'approx';

type DistributedOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type StepDraft = DistributedOmit<MacroStep, 'id'>;

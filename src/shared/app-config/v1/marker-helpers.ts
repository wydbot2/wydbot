import type { MacroStepConfig } from './steps';

/**
 * Permissive on input — only normalizes case and whitespace. Other characters
 * pass through so the schema regex on submit can flag the exact offender.
 */
export const normalizeMarkerName = (raw: string): string => raw.toUpperCase().replace(/\s+/g, '_');

/**
 * Comparison ("same name?") lives here so changing equality semantics later
 * (e.g. case-insensitive) is a single-file edit. Caller picks the scope:
 * full config at parse-time, siblings-minus-self at UI edit-time.
 *
 * Scope is unified across marker and script — both share the named-step
 * namespace (see `AppConfigV1Schema.superRefine`).
 */
export const hasNamedStepConflict = (
  steps: ReadonlyArray<MacroStepConfig>,
  name: string,
): boolean => steps.some((s) => (s.kind === 'marker' || s.kind === 'script') && s.name === name);

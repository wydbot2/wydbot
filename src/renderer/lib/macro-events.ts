import type { MPosition } from '@shared/types';
import type { MoveRejectedReason } from './move-echo-bus';

/**
 * Typed event bus for the macro subsystem. Synchronous emit; subscribers run
 * in registration order. Combat-sensitive consumers depend on this ordering —
 * do NOT defer via Promise/queueMicrotask.
 */

/** The walker's move-source key; centralized so producer and consumers can't drift. */
export const WALKER_SOURCE = 'macro-engine';

/** Echo-bus rejection reasons plus engine-local `aborted` / `unknown`. */
export type MoveRejectionReason = MoveRejectedReason | 'aborted' | 'unknown';

/** Which server correction drove a positionReset — rubberband (small correction) vs teleport (area change). */
export type PositionResetType = 'rubberband' | 'teleport';

/** Sub-phase of the attack-physical state machine, narrowed to user-visible phases. */
export type AttackPhase = 'engaging' | 'attacking' | 'returning';

/** Why attack-physical abandoned the current target. */
export type AttackGiveUpReason = 'approach-failed' | 'persisted-alive' | 'leash-broken';

export type MacroEvent =
  | { kind: 'positionReset'; type: PositionResetType; pos?: MPosition }
  | { kind: 'walkStarted'; dest: MPosition }
  | { kind: 'walkResolved'; dest: MPosition }
  | { kind: 'walkAborted' }
  | { kind: 'combatStarted'; source: string }
  | { kind: 'combatEnded'; source: string }
  | { kind: 'requestMove'; dest: MPosition; source: string; exact?: boolean }
  | { kind: 'moveCompleted'; source: string; dest: MPosition }
  | { kind: 'moveRejected'; source: string; reason: MoveRejectionReason; detail?: string }
  | { kind: 'targetChanged'; name: string | null }
  | { kind: 'attackPhaseChanged'; phase: AttackPhase; targetName: string | null }
  | { kind: 'attackGaveUp'; reason: AttackGiveUpReason; targetName: string }
  | {
      kind: 'skillCastFired';
      source: string;
      skillId: number;
      priority: number;
      cooldownEndsMs: number;
    };

type Subscriber = (event: MacroEvent) => void;

const subscribers = new Set<Subscriber>();

export const emitMacroEvent = (event: MacroEvent): void => {
  // Snapshot to avoid surprises if a subscriber registers another mid-emit.
  for (const fn of Array.from(subscribers)) fn(event);
};

export const onMacroEvent = (fn: Subscriber): (() => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

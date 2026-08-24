import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { ulid } from 'ulid';
import type { MPosition } from '@shared/types';
import type {
  AppConfigV1,
  DeathReturnConfig,
  AutoStackConfig,
  AutoBuffConfig,
  AutoSummonConfig,
  AutoDropConfig,
  AutoGroupConfig,
  AutoGroupMember,
  AttackMode,
  AttackTargeting,
  MonsterTarget,
  RotationSlot,
  GiveUp,
} from '@shared/app-config';
import type {
  AutoHealingConfig,
  AutoHealingMountFeedConfig,
  AutoHealingHpConfig,
  AutoHealingMpConfig,
  AutoHealingDebuffCureConfig,
} from '@shared/app-config/v1/sections/auto-healing';
import {
  DEFAULT_ATTACK_RANGE,
  DEFAULT_DETECTION_RADIUS,
  DEFAULT_GIVEUP_TIMEOUT_SEC,
  ROTATION_SLOT_COUNT,
} from '@shared/constants/attack';
import type { MacroStep, StepDraft, WalkMode } from './macro-types';
import { useMacroLifecycleStore } from './macro-lifecycle-store';
import { useMacroNavigationStore } from './macro-navigation-store';
import { useMacroUiStore } from './macro-ui-store';

type InteractStep = Extract<MacroStep, { kind: 'interact' }>;
type InteractTarget = InteractStep['target'];
type FollowStep = Extract<MacroStep, { kind: 'follow' }>;
type FollowTarget = FollowStep['target'];

const RECENTS_KEY = 'wyd:app-config-recents';
const MAX_RECENTS = 10;

const loadRecents = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
};

const saveRecents = (paths: string[]): void => {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(paths));
  } catch {
    // localStorage full or disabled — silent fail (recents are best-effort)
  }
};

const emptyConfig: AppConfigV1 = {
  version: 1,
  name: '',
};

/** Stable sentinel — fresh `[]` from a selector triggers useShallow re-render loops. */
export const EMPTY_STEPS: MacroStep[] = [];
export const EMPTY_MONSTERS: MonsterTarget[] = [];
export const EMPTY_MEMBERS: AutoGroupMember[] = [];

const computeHash = (config: AppConfigV1): string => JSON.stringify(config);

const emptyMetadata = {
  currentPath: null as string | null,
  currentName: '',
  createdAt: null as string | null,
  baselineHash: computeHash(emptyConfig),
};

interface AppConfigState {
  /** Persisted config — serialized to JSON files via Open/Save. */
  config: AppConfigV1;

  // ── Metadata (NOT serialized) ────────────────────────
  /** null = untitled (never saved). */
  currentPath: string | null;
  /** Display name shown in the file menu — derived from filename. */
  currentName: string;
  /** Preserved across saves; never regenerated. */
  createdAt: string | null;
  /** Snapshot of `config` at last load/save; compared with current to derive `isDirty`. */
  baselineHash: string;
  /** Most-recent-first; persisted to localStorage. */
  recents: string[];

  // ── Metadata setters ─────────────────────────────────
  setLoaded: (path: string, name: string, config: AppConfigV1) => void;
  /** Swaps the active config without rebasing `baselineHash` — marks dirty (e.g. skill sanitization). */
  replaceConfig: (config: AppConfigV1) => void;
  setSaved: (path: string) => void;
  setName: (name: string) => void;
  newConfig: () => void;
  pushRecent: (path: string) => void;
  removeRecent: (path: string) => void;

  // ── Misc section setters ─────────────────────────────
  updateMiscDeathReturn: (patch: Partial<DeathReturnConfig>) => void;
  updateMiscAutoStack: (patch: Partial<AutoStackConfig>) => void;
  updateMiscAutoBuff: (patch: Partial<AutoBuffConfig>) => void;
  updateMiscAutoSummon: (patch: Partial<AutoSummonConfig>) => void;
  updateMiscAutoDrop: (patch: Partial<AutoDropConfig>) => void;
  updateMiscAutoGroup: (patch: Partial<AutoGroupConfig>) => void;
  /** Auto Healing — master switch (preserves sub-configs). */
  updateMiscAutoHealingMaster: (patch: { enabled: boolean }) => void;
  updateMiscAutoHealingMountFeed: (patch: Partial<AutoHealingMountFeedConfig>) => void;
  updateMiscAutoHealingHp: (patch: Partial<AutoHealingHpConfig>) => void;
  updateMiscAutoHealingMp: (patch: Partial<AutoHealingMpConfig>) => void;
  updateMiscAutoHealingDebuffCure: (patch: Partial<AutoHealingDebuffCureConfig>) => void;

  // ── Attack section setters ───────────────────────────
  updateAttackEnabled: (enabled: boolean) => void;
  updateAttackMode: (mode: AttackMode) => void;
  updateAttackTargeting: (patch: Partial<AttackTargeting>) => void;
  updateAttackMonsters: (next: MonsterTarget[]) => void;
  updateAttackRotationSlot: (index: number, slot: RotationSlot | null) => void;
  updateAttackGiveUp: (patch: Partial<GiveUp>) => void;

  // ── Step CRUD (steps live inside config.steps) ───────
  addStep: (step: StepDraft) => void;
  removeStep: (id: string) => void;
  moveStep: (id: string, direction: 'up' | 'down') => void;
  updateScriptStep: (id: string, patch: { name?: string; source?: string }) => void;
  updateWalkStep: (id: string, patch: { position?: MPosition; mode?: WalkMode }) => void;
  updateInteractStep: (id: string, patch: { target?: InteractTarget }) => void;
  updateFollowStep: (id: string, patch: { target?: FollowTarget }) => void;
  updateDelayStep: (id: string, patch: { ms?: number }) => void;
  updateMarkerStep: (id: string, patch: { name?: string }) => void;
  clearSteps: () => void;
  replaceSteps: (steps: MacroStep[]) => void;
}

/** Empty array drops the `steps` key — schema rejects `steps: []` via min-2. */
const withSteps = (config: AppConfigV1, steps: MacroStep[]): AppConfigV1 => {
  if (steps.length === 0) {
    const next = { ...config };
    delete next.steps;
    return next;
  }
  return { ...config, steps };
};

export const useAppConfigStore = create<AppConfigState>()(
  subscribeWithSelector((set) => ({
    config: emptyConfig,
    ...emptyMetadata,
    recents: loadRecents(),

    setLoaded: (path, name, config) =>
      set({
        currentPath: path,
        currentName: name,
        createdAt: config.createdAt ?? null,
        config,
        baselineHash: computeHash(config),
      }),

    replaceConfig: (config) => set({ config }),

    setSaved: (path) =>
      set((state) => ({ currentPath: path, baselineHash: computeHash(state.config) })),

    setName: (name) => set({ currentName: name }),

    newConfig: () => {
      // Cross-store: reset macro runtime when starting fresh.
      useMacroLifecycleStore.getState().stop();
      set({ config: emptyConfig, ...emptyMetadata });
    },

    pushRecent: (path) =>
      set((state) => {
        const next = [path, ...state.recents.filter((p) => p !== path)].slice(0, MAX_RECENTS);
        saveRecents(next);
        return { recents: next };
      }),

    removeRecent: (path) =>
      set((state) => {
        const next = state.recents.filter((p) => p !== path);
        saveRecents(next);
        return { recents: next };
      }),

    updateMiscDeathReturn: (patch) =>
      set((state) => {
        const current: DeathReturnConfig = state.config.misc?.deathReturn ?? {
          enabled: false,
          mode: 'continue',
        };
        const next: DeathReturnConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, deathReturn: next },
          },
        };
      }),

    updateMiscAutoStack: (patch) =>
      set((state) => {
        const current: AutoStackConfig = state.config.misc?.autoStack ?? { enabled: false };
        const next: AutoStackConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, autoStack: next },
          },
        };
      }),

    updateMiscAutoBuff: (patch) =>
      set((state) => {
        const current: AutoBuffConfig = state.config.misc?.autoBuff ?? {
          enabled: false,
          skills: [],
        };
        const next: AutoBuffConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, autoBuff: next },
          },
        };
      }),

    updateMiscAutoSummon: (patch) =>
      set((state) => {
        const current: AutoSummonConfig = state.config.misc?.autoSummon ?? {
          enabled: false,
          skill: null,
        };
        const next: AutoSummonConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, autoSummon: next },
          },
        };
      }),

    updateMiscAutoDrop: (patch) =>
      set((state) => {
        const current: AutoDropConfig = state.config.misc?.autoDrop ?? {
          enabled: false,
          rules: [],
        };
        const next: AutoDropConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, autoDrop: next },
          },
        };
      }),

    updateMiscAutoGroup: (patch) =>
      set((state) => {
        const current: AutoGroupConfig = state.config.misc?.autoGroup ?? {
          enabled: false,
          mode: 'leader',
          whitelist: [],
        };
        const next: AutoGroupConfig = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            misc: { ...state.config.misc, autoGroup: next },
          },
        };
      }),

    updateMiscAutoHealingMaster: (patch) =>
      set((state) => {
        const current: AutoHealingConfig = state.config.misc?.autoHealing ?? { enabled: false };
        const next: AutoHealingConfig = { ...current, enabled: patch.enabled };
        return {
          config: { ...state.config, misc: { ...state.config.misc, autoHealing: next } },
        };
      }),

    updateMiscAutoHealingMountFeed: (patch) =>
      set((state) => {
        const root: AutoHealingConfig = state.config.misc?.autoHealing ?? { enabled: false };
        const current: AutoHealingMountFeedConfig = root.mountFeed ?? {
          enabled: false,
          thresholdPct: 30,
          actions: [],
        };
        const next: AutoHealingConfig = { ...root, mountFeed: { ...current, ...patch } };
        return {
          config: { ...state.config, misc: { ...state.config.misc, autoHealing: next } },
        };
      }),

    updateMiscAutoHealingHp: (patch) =>
      set((state) => {
        const root: AutoHealingConfig = state.config.misc?.autoHealing ?? { enabled: false };
        const current: AutoHealingHpConfig = root.hp ?? {
          enabled: false,
          thresholdPct: 60,
          actions: [],
        };
        const next: AutoHealingConfig = { ...root, hp: { ...current, ...patch } };
        return {
          config: { ...state.config, misc: { ...state.config.misc, autoHealing: next } },
        };
      }),

    updateMiscAutoHealingMp: (patch) =>
      set((state) => {
        const root: AutoHealingConfig = state.config.misc?.autoHealing ?? { enabled: false };
        const current: AutoHealingMpConfig = root.mp ?? {
          enabled: false,
          thresholdPct: 30,
          actions: [],
        };
        const next: AutoHealingConfig = { ...root, mp: { ...current, ...patch } };
        return {
          config: { ...state.config, misc: { ...state.config.misc, autoHealing: next } },
        };
      }),

    updateMiscAutoHealingDebuffCure: (patch) =>
      set((state) => {
        const root: AutoHealingConfig = state.config.misc?.autoHealing ?? { enabled: false };
        const current: AutoHealingDebuffCureConfig = root.debuffCure ?? {
          enabled: false,
          actions: [],
        };
        const next: AutoHealingConfig = { ...root, debuffCure: { ...current, ...patch } };
        return {
          config: { ...state.config, misc: { ...state.config.misc, autoHealing: next } },
        };
      }),

    updateAttackEnabled: (enabled) =>
      set((state) => ({
        config: {
          ...state.config,
          attack: { ...state.config.attack, enabled },
        },
      })),

    updateAttackMode: (mode) =>
      set((state) => ({
        config: {
          ...state.config,
          attack: { ...state.config.attack, mode },
        },
      })),

    updateAttackTargeting: (patch) =>
      set((state) => {
        const current: AttackTargeting = state.config.attack?.targeting ?? {
          detectionRadius: DEFAULT_DETECTION_RADIUS,
          attackRange: DEFAULT_ATTACK_RANGE,
        };
        const next: AttackTargeting = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            attack: { ...state.config.attack, targeting: next },
          },
        };
      }),

    updateAttackMonsters: (next) =>
      set((state) => ({
        config: {
          ...state.config,
          attack: { ...state.config.attack, monsters: next },
        },
      })),

    updateAttackRotationSlot: (index, slot) =>
      set((state) => {
        const currentSlots: (RotationSlot | null)[] =
          state.config.attack?.rotation?.slots ?? new Array(ROTATION_SLOT_COUNT).fill(null);
        const nextSlots = [...currentSlots];
        nextSlots[index] = slot;
        return {
          config: {
            ...state.config,
            attack: { ...state.config.attack, rotation: { slots: nextSlots } },
          },
        };
      }),

    updateAttackGiveUp: (patch) =>
      set((state) => {
        const current: GiveUp = state.config.attack?.giveUp ?? {
          timeoutSec: DEFAULT_GIVEUP_TIMEOUT_SEC,
        };
        const next: GiveUp = { ...current, ...patch };
        return {
          config: {
            ...state.config,
            attack: { ...state.config.attack, giveUp: next },
          },
        };
      }),

    addStep: (step) =>
      set((state) => {
        const newStep = { ...step, id: ulid() } as MacroStep;
        const steps = [...(state.config.steps ?? []), newStep];
        return { config: withSteps(state.config, steps) };
      }),

    removeStep: (id) =>
      set((state) => {
        const existing = state.config.steps ?? [];
        const removedIndex = existing.findIndex((s) => s.id === id);
        if (removedIndex === -1) return state;
        const newSteps = existing.filter((s) => s.id !== id);

        const navigation = useMacroNavigationStore.getState();
        const ui = useMacroUiStore.getState();
        const lifecycle = useMacroLifecycleStore.getState();

        // Navigation: shift left if removed before the run cursor, stop the
        // macro if removed AT the run cursor (can't resume from a deleted step).
        if (removedIndex < navigation.currentStepIndex) {
          navigation.setCurrentIndex(navigation.currentStepIndex - 1);
        } else if (removedIndex === navigation.currentStepIndex) {
          lifecycle.stop();
        }

        // UI editor cursor: same shift logic against the selection.
        if (ui.selectedStepIndex !== null) {
          if (removedIndex < ui.selectedStepIndex) {
            ui.setSelectedIndex(ui.selectedStepIndex - 1);
          } else if (removedIndex === ui.selectedStepIndex) {
            ui.setSelectedIndex(null);
          }
        }

        return { config: withSteps(state.config, newSteps) };
      }),

    moveStep: (id, direction) =>
      set((state) => {
        const steps = state.config.steps ?? [];
        const idx = steps.findIndex((s) => s.id === id);
        if (idx === -1) return state;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= steps.length) return state;
        const newSteps = [...steps];
        [newSteps[idx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[idx]];
        return { config: withSteps(state.config, newSteps) };
      }),

    updateScriptStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'script') return s;
            return {
              ...s,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.source !== undefined ? { source: patch.source } : {}),
            };
          }),
        ),
      })),

    updateWalkStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'walk') return s;
            return {
              ...s,
              ...(patch.position !== undefined ? { position: patch.position } : {}),
              ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
            };
          }),
        ),
      })),

    updateInteractStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'interact') return s;
            if (patch.target === undefined) return s;
            return { ...s, target: patch.target };
          }),
        ),
      })),

    updateFollowStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'follow') return s;
            if (patch.target === undefined) return s;
            return { ...s, target: patch.target };
          }),
        ),
      })),

    updateDelayStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'delay') return s;
            if (patch.ms === undefined) return s;
            return { ...s, ms: patch.ms };
          }),
        ),
      })),

    updateMarkerStep: (id, patch) =>
      set((state) => ({
        config: withSteps(
          state.config,
          (state.config.steps ?? []).map((s) => {
            if (s.id !== id || s.kind !== 'marker') return s;
            if (patch.name === undefined) return s;
            return { ...s, name: patch.name };
          }),
        ),
      })),

    clearSteps: () => {
      useMacroLifecycleStore.getState().stop();
      set((state) => ({ config: withSteps(state.config, []) }));
    },

    replaceSteps: (steps) => {
      useMacroLifecycleStore.getState().stop();
      set((state) => ({ config: withSteps(state.config, steps) }));
    },
  })),
);

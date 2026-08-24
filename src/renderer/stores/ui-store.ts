import { create } from 'zustand';
import type { DivergenceViewGroup } from '../lib/skill-divergence-view';
import type { ConfigIssue } from '../lib/config-issue-format';
import { useAppConfigStore } from './app-config-store';

/** Payload for the config-error detail dialog (opened from the summarized toast). */
interface ConfigErrorPayload {
  issues: ConfigIssue[];
  /** Pretty-printed Zod issues for the dialog's "Copiar detalhes" button. */
  rawJson: string;
  /** Which operation failed — the dialog derives its title + lead from this. */
  context: 'save' | 'load';
}

export type Screen = 'splash' | 'login' | 'charlist' | 'game' | 'reconnecting' | 'reconnect-failed';
export type ModalType =
  | 'game-message'
  | 'macro-alert'
  | 'skill-divergence'
  | 'config-error'
  | 'step-edit'
  | 'script-edit'
  | null;

interface UIState {
  currentScreen: Screen;
  activeModal: ModalType;
  gameMessage: string | null;
  /** Macro `ctx.alert` message; `null` when closed. */
  macroAlert: string | null;
  /** Skill-divergence modal payload; `null` when closed. */
  skillDivergence: DivergenceViewGroup[] | null;
  /** Config-error detail dialog payload; `null` when closed. */
  configError: ConfigErrorPayload | null;

  /** ID of the step being edited by `StepEditModal` or `ScriptEditModal`. */
  editingStepId: string | null;

  isLoading: boolean;

  setScreen: (screen: Screen) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  showGameMessage: (message: string) => void;
  clearGameMessage: () => void;
  showMacroAlert: (message: string) => void;
  closeMacroAlert: () => void;
  showSkillDivergence: (groups: DivergenceViewGroup[]) => void;
  closeSkillDivergence: () => void;
  showConfigError: (payload: ConfigErrorPayload) => void;
  closeConfigError: () => void;

  /** Open the edit modal for any step. Routes by kind: script → ScriptEditModal, others → StepEditModal. */
  openStepEdit: (stepId: string) => void;
  closeStepEdit: () => void;

  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'splash',
  activeModal: null,
  gameMessage: null,
  macroAlert: null,
  skillDivergence: null,
  configError: null,
  editingStepId: null,
  isLoading: false,

  setScreen: (screen) => set({ currentScreen: screen }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  showGameMessage: (message) => set({ gameMessage: message, activeModal: 'game-message' }),
  clearGameMessage: () => set({ gameMessage: null, activeModal: null }),
  showMacroAlert: (message) => set({ macroAlert: message, activeModal: 'macro-alert' }),
  closeMacroAlert: () => set({ macroAlert: null, activeModal: null }),
  showSkillDivergence: (groups) =>
    set({ skillDivergence: groups, activeModal: 'skill-divergence' }),
  closeSkillDivergence: () => set({ skillDivergence: null, activeModal: null }),
  showConfigError: (payload) => set({ configError: payload, activeModal: 'config-error' }),
  closeConfigError: () => set({ configError: null, activeModal: null }),

  openStepEdit: (stepId) => {
    const step = useAppConfigStore.getState().config.steps?.find((s) => s.id === stepId);
    if (!step) return;
    set({
      editingStepId: stepId,
      activeModal: step.kind === 'script' ? 'script-edit' : 'step-edit',
    });
  },
  closeStepEdit: () => set({ editingStepId: null, activeModal: null }),

  setLoading: (loading) => set({ isLoading: loading }),
  reset: () =>
    set({
      currentScreen: 'login',
      activeModal: null,
      gameMessage: null,
      macroAlert: null,
      skillDivergence: null,
      configError: null,
      editingStepId: null,
      isLoading: false,
    }),
}));

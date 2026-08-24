import { type FC, useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import { toast } from 'sonner';
import {
  VALIDATION_MSG,
  hasMonsterConflict,
  type BankRule,
  type ComposeAction,
  type ShopOpen,
  type ShopRule,
} from '@shared/app-config';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import { portalCenter } from '@shared/constants/zone-portals';
import { MacroStatus } from '../../stores/macro-status';
import type { StepDraft } from '../../stores/macro-types';
import { useMacroLifecycleStore } from '../../stores/macro-lifecycle-store';
import { useMacroNavigationStore } from '../../stores/macro-navigation-store';
import { useMacroUiStore } from '../../stores/macro-ui-store';
import { EMPTY_MONSTERS, EMPTY_STEPS, useAppConfigStore } from '../../stores/app-config-store';
import { usePlayerStore } from '../../stores/player-store';
import { MiniMapCanvas, type CanvasContextMenuEvent } from './MiniMapCanvas';
import { StepTable } from './StepTable';
import { GlassPanel } from '../shared/GlassPanel';
import { ENTITY_COLORS } from '../../lib/entity-colors';
import { MINIMAP_THEME } from '../../lib/minimap';
import { getWalkabilityService } from '../../lib/walkability-service';
import { validateStepDraft } from '../../lib/macro-step-validators';
import { formatPosition } from '../../lib/format';
import { startMacro, stopMacro, pauseMacro, resumeMacro, logMacro } from '../../lib/macro-engine';
import { showNativeNotification } from '../../lib/macro-notification';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { MacroHeaderBar } from './MacroHeaderBar';
import { StepAddForm } from './StepAddForm';
import { StepContextCascadeMenu, type CascadePick } from './StepContextCascadeMenu';
import { AttackSection } from './attack/AttackSection';
import { ScriptEditModal } from '../modals/ScriptEditModal';
import { StepEditModal } from '../modals/StepEditModal';
import { BankConfigModal } from './bank/BankConfigModal';
import { ComposeConfigModal } from './compose/ComposeConfigModal';
import { ShopConfigModal } from './shop/ShopConfigModal';
import { ProbeOverlay } from './ProbeOverlay';
import { probeNpc, probeResultCategory, type ProbeStatus } from '../../lib/npc-probe';
import { findNpcsByName } from '../../lib/entity-selectors';
import { useUIStore } from '../../stores/ui-store';

interface MacroPanelProps {
  isActive: boolean;
}

export const MacroPanel: FC<MacroPanelProps> = ({ isActive }) => {
  const { status, statusMessage } = useMacroLifecycleStore(
    useShallow((s) => ({ status: s.status, statusMessage: s.statusMessage })),
  );
  const currentStepIndex = useMacroNavigationStore((s) => s.currentStepIndex);
  const { selectedStepIndex, setSelectedIndex } = useMacroUiStore(
    useShallow((s) => ({
      selectedStepIndex: s.selectedStepIndex,
      setSelectedIndex: s.setSelectedIndex,
    })),
  );

  const {
    steps,
    addStep,
    removeStep,
    moveStep,
    updateInteractStep,
    attackMonsters,
    updateAttackMonsters,
  } = useAppConfigStore(
    useShallow((s) => ({
      steps: s.config.steps ?? EMPTY_STEPS,
      addStep: s.addStep,
      removeStep: s.removeStep,
      moveStep: s.moveStep,
      updateInteractStep: s.updateInteractStep,
      attackMonsters: s.config.attack?.monsters ?? EMPTY_MONSTERS,
      updateAttackMonsters: s.updateAttackMonsters,
    })),
  );

  const playerPos = usePlayerStore(useShallow((s) => s.position));

  const [ctxMenu, setCtxMenu] = useState<CanvasContextMenuEvent | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; index: number } | null>(null);
  const [bankModal, setBankModal] = useState<{
    mode: 'create' | 'edit';
    stepId?: string;
    npcName: string;
    rules: BankRule[];
    fullStackOnly: boolean;
  } | null>(null);
  const [composeModal, setComposeModal] = useState<{
    mode: 'create' | 'edit';
    stepId?: string;
    npcName: string;
    composeRoot?: number;
    actions: ComposeAction[];
  } | null>(null);
  const [shopModal, setShopModal] = useState<{
    mode: 'create' | 'edit';
    stepId?: string;
    npcName: string;
    rules: ShopRule[];
    open: ShopOpen;
    shopItems?: IpcShopItem[];
  } | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus | null>(null);
  const probeController = useRef<AbortController | null>(null);
  const prevStatus = useRef(status);

  // Gate step creation until attribute map loads (prevents walks into walls).
  const [walkabilityReady, setWalkabilityReady] = useState(false);
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    void getWalkabilityService()
      .ready()
      .then(() => {
        if (!cancelled) setWalkabilityReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isActive]);

  const closeCtxMenu = useCallback(() => {
    setCtxMenu(null);
  }, []);

  const handleContextMenu = useCallback(
    (e: CanvasContextMenuEvent) => {
      if (status === MacroStatus.Running) return;
      setCtxMenu(e);
    },
    [status],
  );

  const tryAddStep = useCallback(
    (step: StepDraft) => {
      if (!walkabilityReady) {
        toast.error(VALIDATION_MSG.mapLoading);
        closeCtxMenu();
        return;
      }
      const result = validateStepDraft(step, { steps, siblings: steps, playerPos });
      if (!result.ok) {
        logMacro('warn', result.message);
        toast.error(result.message);
        closeCtxMenu();
        return;
      }
      if (result.warning) {
        logMacro('warn', result.warning);
        toast.warning(result.warning);
      }
      addStep(step);
      closeCtxMenu();
    },
    [steps, playerPos, addStep, closeCtxMenu, walkabilityReady],
  );

  // Universal NPC probe — approach + observe response, then open the right modal.
  // Shop probe persists the open path that produced 0x17C (runtime SoT).
  const handleProbe = useCallback(
    async (npcName: string) => {
      // Abort any previous probe
      probeController.current?.abort();
      const controller = new AbortController();
      probeController.current = controller;

      try {
        const result = await probeNpc(npcName, controller.signal, setProbeStatus);
        if (controller.signal.aborted) return;

        const category = probeResultCategory(result);
        const targetNpcName = result.npc.name;

        if (result.category === 'bank') {
          setBankModal({ mode: 'create', npcName: targetNpcName, rules: [], fullStackOnly: false });
        } else if (result.category === 'compose') {
          setComposeModal({
            mode: 'create',
            npcName: targetNpcName,
            composeRoot: result.npc.composeRoot,
            actions: [],
          });
        } else if (result.category === 'shop') {
          setShopModal({
            mode: 'create',
            npcName: targetNpcName,
            rules: [],
            open: result.open,
            shopItems: result.items,
          });
        } else {
          // Generic dialog/unknown — add interact step directly (no modal)
          tryAddStep({
            kind: 'interact',
            target: { npcName: targetNpcName, npcCategory: category },
          });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error(err instanceof Error ? err.message : 'Falha ao sondar o NPC');
        }
      } finally {
        if (probeController.current === controller) {
          probeController.current = null;
          setProbeStatus(null);
        }
      }
    },
    [tryAddStep],
  );

  const handleCascadePick = useCallback(
    (pick: CascadePick) => {
      if (!ctxMenu) return;
      if (pick === 'attack-target') {
        if (ctxMenu.entity?.category !== 'monster') return;
        const name = ctxMenu.entity.name;
        if (hasMonsterConflict(attackMonsters, name)) {
          toast.error(VALIDATION_MSG.duplicateMonster);
        } else {
          updateAttackMonsters([...attackMonsters, { name }]);
        }
        closeCtxMenu();
        return;
      }
      if (pick === 'npc-follow') {
        const entity = ctxMenu.entity;
        // No capability gate — any NPC can be followed.
        if (entity?.category === 'npc') {
          tryAddStep({ kind: 'follow', target: { npcName: entity.name } });
        } else {
          closeCtxMenu();
        }
        return;
      }
      if (pick === 'npc-interact') {
        const entity = ctxMenu.entity;
        if (entity?.category === 'npc') {
          // All NPC types go through the probe — approach + click + observe response.
          void handleProbe(entity.name);
        }
        closeCtxMenu();
        return;
      }
      let draft: StepDraft | null = null;
      switch (pick) {
        case 'walk-exact':
          draft = {
            kind: 'walk',
            position: { x: ctxMenu.worldX, y: ctxMenu.worldY },
            mode: 'exact',
          };
          break;
        case 'walk-approx':
          draft = {
            kind: 'walk',
            position: { x: ctxMenu.worldX, y: ctxMenu.worldY },
            mode: 'approx',
          };
          break;
        case 'portal-teleport': {
          const portal = ctxMenu.portal;
          if (!portal) {
            closeCtxMenu();
            return;
          }
          draft = {
            kind: 'portal',
            position: portalCenter(portal),
          };
          break;
        }
      }
      if (draft) tryAddStep(draft);
    },
    [ctxMenu, tryAddStep, attackMonsters, updateAttackMonsters, closeCtxMenu, handleProbe],
  );

  // Service payload opens the rules editor; bare interact uses the generic editor.
  const handleEditStep = useCallback(
    (id: string) => {
      const s = steps.find((x) => x.id === id);
      if (s?.kind === 'interact' && s.target.bank) {
        setBankModal({
          mode: 'edit',
          stepId: id,
          npcName: s.target.npcName,
          rules: s.target.bank.rules,
          fullStackOnly: s.target.bank.depositFullStackOnly ?? false,
        });
      } else if (s?.kind === 'interact' && s.target.compose) {
        setComposeModal({
          mode: 'edit',
          stepId: id,
          npcName: s.target.npcName,
          composeRoot: findNpcsByName(s.target.npcName)[0]?.composeRoot,
          actions: s.target.compose.actions,
        });
      } else if (s?.kind === 'interact' && s.target.shop) {
        setShopModal({
          mode: 'edit',
          stepId: id,
          npcName: s.target.npcName,
          rules: s.target.shop.rules,
          open: s.target.shop.open ?? 'dialog',
        });
      } else {
        useUIStore.getState().openStepEdit(id);
      }
    },
    [steps],
  );

  // Toast when engine auto-pauses with a reason
  useEffect(() => {
    if (
      status === MacroStatus.Paused &&
      prevStatus.current === MacroStatus.Running &&
      statusMessage
    ) {
      toast.error(statusMessage);
      void showNativeNotification('Macro pausado', statusMessage);
    }
    prevStatus.current = status;
  }, [status, statusMessage]);

  const handlePrimary = useCallback(() => {
    if (status === MacroStatus.Running) pauseMacro();
    else if (status === MacroStatus.Paused) resumeMacro();
    else startMacro(selectedStepIndex ?? undefined);
  }, [status, selectedStepIndex]);

  return (
    <div className="flex flex-col gap-2">
      <MacroHeaderBar
        status={status}
        statusMessage={statusMessage}
        selectedStepIndex={selectedStepIndex}
        currentStepIndex={currentStepIndex}
        onPrimary={handlePrimary}
        onStop={() => stopMacro()}
        primaryDisabled={status === MacroStatus.Idle && steps.length < 2}
      />

      {/* Two-column grid */}
      <div className="grid grid-cols-[1fr_auto] gap-3">
        {/* Left: Step table + add form */}
        <div className="flex max-h-[320px] flex-col">
          <StepTable
            steps={steps}
            onRemove={(id) => {
              const idx = steps.findIndex((s) => s.id === id);
              setDeleteTarget({ id, index: idx });
              setDeleteDialogOpen(true);
            }}
            onMove={status === MacroStatus.Idle ? moveStep : undefined}
            activeIndex={status !== MacroStatus.Idle ? currentStepIndex : undefined}
            selectedIndex={status === MacroStatus.Idle ? selectedStepIndex : undefined}
            onSelectStep={status === MacroStatus.Idle ? setSelectedIndex : undefined}
            onEdit={status === MacroStatus.Idle ? handleEditStep : undefined}
            isRunning={status !== MacroStatus.Idle}
            errorMessage={status === MacroStatus.Paused ? statusMessage : null}
            addForm={
              <div className="relative">
                <StepAddForm
                  onAdd={tryAddStep}
                  onProbe={handleProbe}
                  probeInProgress={probeStatus !== null}
                />
                {status !== MacroStatus.Idle && (
                  <GlassPanel className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg">
                    <span className="text-xs text-gray-400">
                      Pare o macro para editar ou adicionar novos passos
                    </span>
                  </GlassPanel>
                )}
              </div>
            }
          />
        </div>

        {/* Right: Embedded mini map */}
        <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50">
          <div className="relative">
            <MiniMapCanvas
              size={320}
              isActive={isActive}
              autoFollow={status === MacroStatus.Running}
              onCanvasContextMenu={handleContextMenu}
              steps={steps}
              activeStepIndex={status !== MacroStatus.Idle ? currentStepIndex : undefined}
              selectedStepIndex={status === MacroStatus.Idle ? selectedStepIndex : undefined}
            />

            {/* Coord HUD — top-left overlay */}
            <div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md border border-gray-700/60 bg-gray-900/80 px-1.5 py-0.5 backdrop-blur">
              <span
                aria-hidden="true"
                className="block h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.3)]"
              />
              <span className="text-[9px] tracking-wide text-gray-400 uppercase">você</span>
              <span className="font-mono text-[11px] text-gray-100 tabular-nums">
                {formatPosition(playerPos)}
              </span>
            </div>

            {/* Legend overlay — bottom-left */}
            {showLegend && (
              <GlassPanel className="absolute bottom-2 left-2 z-10 flex gap-3 rounded-md px-2.5 py-2 text-xs text-gray-400">
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${ENTITY_COLORS.player_self.tw}`}
                    />{' '}
                    Você
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${ENTITY_COLORS.npc.tw}`} />{' '}
                    NPC
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${ENTITY_COLORS.monster.tw}`}
                    />{' '}
                    Monstro
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full border bg-slate-900"
                      style={{ borderColor: MINIMAP_THEME.pin.walkBorder }}
                    />{' '}
                    Exato
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full border bg-slate-900"
                      style={{ borderColor: MINIMAP_THEME.pin.walkApproxBorder }}
                    />{' '}
                    Aproximado
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-sm border"
                      style={{
                        backgroundColor: MINIMAP_THEME.zonePortal.fill,
                        borderColor: MINIMAP_THEME.zonePortal.stroke,
                      }}
                    />{' '}
                    Portal
                  </span>
                </div>
                <div className="w-px self-stretch bg-gray-600/50" />
                <div className="flex flex-col justify-center gap-1 text-[10px] opacity-70">
                  <span>Espaço+Arrastar: mover</span>
                  <span>C: centrar no player</span>
                  <span>Clique-direito: adicionar</span>
                </div>
              </GlassPanel>
            )}

            {/* Legend toggle — top-right */}
            <Button
              variant="ghost-muted"
              size="icon-sm"
              onClick={() => setShowLegend((v) => !v)}
              className="absolute top-2 right-2 z-10"
              aria-label={showLegend ? 'Ocultar legenda' : 'Mostrar legenda'}
            >
              <InformationCircleIcon className="h-4 w-4" />
            </Button>

            {ctxMenu && (
              <StepContextCascadeMenu
                position={{ x: ctxMenu.clientX, y: ctxMenu.clientY }}
                contextLabel={formatPosition({ x: ctxMenu.worldX, y: ctxMenu.worldY })}
                entity={ctxMenu.entity}
                portal={ctxMenu.portal}
                onPick={handleCascadePick}
                onClose={closeCtxMenu}
              />
            )}
          </div>
        </div>
      </div>

      <AttackSection />

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Remover passo"
        message={`Remover passo ${(deleteTarget?.index ?? 0) + 1}?`}
        confirmLabel="Remover"
        onConfirm={() => {
          if (deleteTarget) removeStep(deleteTarget.id);
          setDeleteDialogOpen(false);
        }}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      <ScriptEditModal />
      <StepEditModal />
      {bankModal && (
        <BankConfigModal
          isOpen
          mode={bankModal.mode}
          initialNpcName={bankModal.npcName}
          initialRules={bankModal.rules}
          initialFullStackOnly={bankModal.fullStackOnly}
          onClose={() => setBankModal(null)}
          onSave={(target) => {
            if (bankModal.mode === 'create') tryAddStep({ kind: 'interact', target });
            else if (bankModal.stepId) updateInteractStep(bankModal.stepId, { target });
            setBankModal(null);
          }}
        />
      )}
      {composeModal && (
        <ComposeConfigModal
          isOpen
          mode={composeModal.mode}
          npcName={composeModal.npcName}
          composeRoot={composeModal.composeRoot}
          initialActions={composeModal.actions}
          onSave={(target) => {
            if (composeModal.mode === 'create') tryAddStep({ kind: 'interact', target });
            else if (composeModal.stepId) updateInteractStep(composeModal.stepId, { target });
            setComposeModal(null);
          }}
          onClose={() => setComposeModal(null)}
        />
      )}
      {shopModal && (
        <ShopConfigModal
          isOpen
          mode={shopModal.mode}
          initialNpcName={shopModal.npcName}
          initialRules={shopModal.rules}
          initialOpen={shopModal.open}
          shopItems={shopModal.shopItems}
          onSave={(target) => {
            if (shopModal.mode === 'create') tryAddStep({ kind: 'interact', target });
            else if (shopModal.stepId) updateInteractStep(shopModal.stepId, { target });
            setShopModal(null);
          }}
          onClose={() => setShopModal(null)}
        />
      )}
      {probeStatus && (
        <ProbeOverlay status={probeStatus} onCancel={() => probeController.current?.abort()} />
      )}
    </div>
  );
};

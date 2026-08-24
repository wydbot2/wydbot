import { type FC, useEffect, useState } from 'react';
import {
  Description,
  Field,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import {
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  VALIDATION_MSG,
  normalizeMarkerName,
} from '@shared/app-config';
import { EMPTY_STEPS, useAppConfigStore } from '../../stores/app-config-store';
import { useUIStore } from '../../stores/ui-store';
import { usePlayerStore } from '../../stores/player-store';
import type { WalkMode } from '../../stores/macro-types';
import { WALK_MODE_LABELS } from '../../stores/macro-labels';
import { validateStepDraft } from '../../lib/macro-step-validators';
import { findNpcsByName } from '../../lib/entity-selectors';
import { parsePosition, parseNpcName, parseDelaySeconds } from '../../lib/macro-form-parse';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { TextInput } from '../shared/TextInput';

const MIN_DELAY_SECONDS = MIN_DELAY_MS / 1000;
const MAX_DELAY_SECONDS = MAX_DELAY_MS / 1000;

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-400';

export const StepEditModal: FC = () => {
  const isOpen = useUIStore((s) => s.activeModal === 'step-edit');
  const stepId = useUIStore((s) => s.editingStepId);
  const closeStepEdit = useUIStore((s) => s.closeStepEdit);

  const step = useAppConfigStore(
    useShallow((s) => (stepId ? s.config.steps?.find((x) => x.id === stepId) : undefined)),
  );
  const allSteps = useAppConfigStore((s) => s.config.steps ?? EMPTY_STEPS);
  const updateWalkStep = useAppConfigStore((s) => s.updateWalkStep);
  const updateInteractStep = useAppConfigStore((s) => s.updateInteractStep);
  const updateFollowStep = useAppConfigStore((s) => s.updateFollowStep);
  const updateDelayStep = useAppConfigStore((s) => s.updateDelayStep);
  const updateMarkerStep = useAppConfigStore((s) => s.updateMarkerStep);
  const playerPos = usePlayerStore(useShallow((s) => s.position));

  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [mode, setMode] = useState<WalkMode>('exact');
  const [npcName, setNpcName] = useState('');
  const [seconds, setSeconds] = useState('1');
  const [markerName, setMarkerName] = useState('');

  useEffect(() => {
    if (!isOpen || !step) return;
    switch (step.kind) {
      case 'walk':
        setX(String(step.position.x));
        setY(String(step.position.y));
        setMode(step.mode);
        return;
      case 'interact':
      case 'follow':
        setNpcName(step.target.npcName);
        return;
      case 'delay':
        setSeconds((step.ms / 1000).toString());
        return;
      case 'marker':
        setMarkerName(step.name);
        return;
      case 'portal':
        setX(String(step.position.x));
        setY(String(step.position.y));
        return;
    }
  }, [isOpen, step]);

  // Bank steps are edited by BankConfigModal (rules editor), not this modal.
  const isBankInteract = step?.kind === 'interact' && !!step.target.bank;
  // Composition NPCs open the compose viewer (hosted in MacroPanel), not this editor.
  const isComposeInteract =
    step?.kind === 'interact' &&
    (step.target.npcCategory ?? findNpcsByName(step.target.npcName)[0]?.npcCategory) === 'compose';

  // Step removed externally while modal was open — close without saving.
  if (isOpen && (!step || step.kind === 'script' || isBankInteract || isComposeInteract)) {
    closeStepEdit();
    return null;
  }

  if (!step || step.kind === 'script' || isBankInteract || isComposeInteract) return null;

  const editedIndex = allSteps.findIndex((s) => s.id === step.id);
  const prevSteps = editedIndex >= 0 ? allSteps.slice(0, editedIndex) : allSteps;
  const siblings = allSteps.filter((s) => s.id !== step.id);

  const handleSave = (): void => {
    if (step.kind === 'walk') {
      const pos = parsePosition(x, y);
      if (!pos) {
        toast.error(VALIDATION_MSG.positionNaN);
        return;
      }
      const draft = { kind: 'walk' as const, position: pos, mode };
      const result = validateStepDraft(draft, { steps: prevSteps, siblings, playerPos });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      updateWalkStep(step.id, { position: draft.position, mode: draft.mode });
    } else if (step.kind === 'interact') {
      const trimmed = parseNpcName(npcName);
      if (!trimmed) {
        toast.error(VALIDATION_MSG.npcNameLength);
        return;
      }
      const npcCategory =
        trimmed === step.target.npcName
          ? step.target.npcCategory
          : findNpcsByName(trimmed)[0]?.npcCategory;
      updateInteractStep(step.id, { target: { npcName: trimmed, npcCategory } });
    } else if (step.kind === 'follow') {
      const trimmed = parseNpcName(npcName);
      if (!trimmed) {
        toast.error(VALIDATION_MSG.npcNameLength);
        return;
      }
      updateFollowStep(step.id, { target: { npcName: trimmed } });
    } else if (step.kind === 'delay') {
      const ms = parseDelaySeconds(seconds);
      if (ms === null) {
        toast.error(VALIDATION_MSG.delayRange);
        return;
      }
      updateDelayStep(step.id, { ms });
    } else if (step.kind === 'marker') {
      const draft = { kind: 'marker' as const, name: markerName };
      const result = validateStepDraft(draft, { steps: prevSteps, siblings, playerPos });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      updateMarkerStep(step.id, { name: draft.name });
    } else if (step.kind === 'portal') {
      // Pad choice is catalog-bound; re-add via form/mapa to change destination.
      closeStepEdit();
      return;
    }
    closeStepEdit();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeStepEdit}
      title={`Editar passo #${editedIndex + 1}`}
      footer={
        <>
          <Button variant="ghost" onClick={closeStepEdit}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        {step.kind === 'walk' && (
          <>
            <Field>
              <Label className={LABEL_CLASS}>Posição X</Label>
              <TextInput
                type="number"
                value={x}
                onChange={(e) => setX((e.target as HTMLInputElement).value)}
                className="w-32 font-mono"
              />
            </Field>
            <Field>
              <Label className={LABEL_CLASS}>Posição Y</Label>
              <TextInput
                type="number"
                value={y}
                onChange={(e) => setY((e.target as HTMLInputElement).value)}
                className="w-32 font-mono"
              />
            </Field>
            <Field>
              <Label className={LABEL_CLASS}>Modo</Label>
              <Listbox value={mode} onChange={setMode}>
                <ListboxButton className="relative w-44 cursor-pointer rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-left text-sm text-gray-100 shadow-sm transition hover:border-gray-500 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500">
                  <span className="block truncate">{WALK_MODE_LABELS[mode]}</span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                  </span>
                </ListboxButton>
                <ListboxOptions
                  anchor="bottom start"
                  transition
                  className="z-50 max-h-48 w-[var(--button-width)] overflow-auto rounded-md bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
                >
                  {(['exact', 'approx'] as const).map((m) => (
                    <ListboxOption
                      key={m}
                      value={m}
                      className="group relative cursor-pointer px-3 py-2 text-gray-300 select-none data-[focus]:bg-blue-600 data-[focus]:text-white"
                    >
                      <span className="block truncate group-data-[selected]:font-semibold">
                        {WALK_MODE_LABELS[m]}
                      </span>
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Listbox>
            </Field>
          </>
        )}

        {(step.kind === 'interact' || step.kind === 'follow') && (
          <Field>
            <Label className={LABEL_CLASS}>NPC</Label>
            <TextInput
              type="text"
              value={npcName}
              onChange={(e) => setNpcName((e.target as HTMLInputElement).value)}
              className="w-full"
            />
            <Description className="mt-1 text-[10px] text-gray-500">
              {step.kind === 'follow'
                ? 'Vai até o NPC, sem interagir.'
                : 'Vai até o NPC e interage.'}
            </Description>
          </Field>
        )}

        {step.kind === 'delay' && (
          <Field>
            <Label className={LABEL_CLASS}>Tempo (segundos)</Label>
            <TextInput
              type="number"
              step="0.1"
              min={MIN_DELAY_SECONDS}
              max={MAX_DELAY_SECONDS}
              value={seconds}
              onChange={(e) => setSeconds((e.target as HTMLInputElement).value)}
              className="w-32 font-mono"
            />
            <Description className="mt-1 text-[10px] text-gray-500">
              {MIN_DELAY_SECONDS}–{MAX_DELAY_SECONDS}s
            </Description>
          </Field>
        )}

        {step.kind === 'marker' && (
          <Field>
            <Label className={LABEL_CLASS}>Nome</Label>
            <TextInput
              type="text"
              value={markerName}
              onChange={(e) => {
                setMarkerName(normalizeMarkerName((e.target as HTMLInputElement).value));
              }}
              className="w-full font-mono"
            />
            <Description className="mt-1 text-[10px] text-gray-500">
              A-Z, 0-9, separados por _
            </Description>
          </Field>
        )}

        {step.kind === 'portal' && (
          <Field>
            <Label className={LABEL_CLASS}>Portal</Label>
            <p className="font-mono text-sm text-orange-200">
              {x}, {y}
            </p>
            <Description className="mt-1 text-[10px] text-gray-500">
              Para trocar o portal, remova o passo e adicione outro pelo mapa ou formulário.
            </Description>
          </Field>
        )}
      </div>
    </Modal>
  );
};

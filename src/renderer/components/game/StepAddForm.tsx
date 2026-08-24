import { type FC, useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDownIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import {
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  VALIDATION_MSG,
  normalizeMarkerName,
} from '@shared/app-config';
import type { NpcEntity } from '@shared/types';
import {
  ZONE_PORTALS,
  portalCenter,
  portalKey,
  type ZonePortal,
} from '@shared/constants/zone-portals';
import type { StepDraft } from '../../stores/macro-types';
import type { MacroStepSubtype } from '../../stores/macro-labels';
import { usePlayerStore } from '../../stores/player-store';
import { useAppConfigStore } from '../../stores/app-config-store';
import { useUIStore } from '../../stores/ui-store';
import { useNpcs } from '../../lib/entity-selectors';
import { DEFAULT_SCRIPT_SOURCE } from '../../lib/script-ctx';
import { parseDelaySeconds } from '../../lib/macro-form-parse';
import { formatPosition } from '../../lib/format';
import { TextInput } from '../shared/TextInput';
import { Button } from '../shared/Button';
import { StepActionListbox } from './StepActionListbox';
import { CatChip } from './CatChip';

const MIN_DELAY_SECONDS = MIN_DELAY_MS / 1000;
const MAX_DELAY_SECONDS = MAX_DELAY_MS / 1000;

const parseSeconds = (raw: string): number => Number(raw.replace(',', '.'));

interface StepAddFormProps {
  onAdd: (step: StepDraft) => void;
  /** Probe the selected NPC (approach + click + observe response) to determine its type. */
  onProbe: (npcName: string) => void;
  /** When true, a probe is in-flight — disable the add button. */
  probeInProgress: boolean;
}

export const StepAddForm: FC<StepAddFormProps> = ({ onAdd, onProbe, probeInProgress }) => {
  const playerPos = usePlayerStore(useShallow((player) => player.position));
  const [x, setX] = useState(String(playerPos.x));
  const [y, setY] = useState(String(playerPos.y));
  const [seconds, setSeconds] = useState('1');
  const [subtype, setSubtype] = useState<MacroStepSubtype>('walk-exact');
  const [selectedNpc, setSelectedNpc] = useState<NpcEntity | null>(null);
  const [selectedPortal, setSelectedPortal] = useState<ZonePortal | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [scriptName, setScriptName] = useState('');
  const npcs = useNpcs();

  const isNpcSelect = subtype === 'npc-interact' || subtype === 'npc-follow';
  const isPortalSelect = subtype === 'portal-teleport';

  const handleSubtypeChange = (newSubtype: MacroStepSubtype) => {
    setSubtype(newSubtype);
    setSelectedNpc(null);
    setSelectedPortal(null);
  };

  const handleNpcSelect = (npc: NpcEntity) => {
    setSelectedNpc(npc);
  };

  const secondsValue = parseSeconds(seconds);

  // Loose gating — full validation runs in tryAddStep via validateStepDraft.
  const canSubmit = isNpcSelect
    ? selectedNpc !== null
    : isPortalSelect
      ? selectedPortal !== null
      : subtype === 'delay'
        ? !isNaN(secondsValue)
        : subtype === 'script'
          ? scriptName.trim().length > 0
          : subtype === 'marker'
            ? markerName.trim().length > 0
            : !isNaN(parseInt(x, 10)) && !isNaN(parseInt(y, 10));

  const handleAdd = () => {
    if (subtype === 'npc-follow') {
      if (!selectedNpc) return;
      // No capability gate — any NPC can be followed.
      onAdd({ kind: 'follow', target: { npcName: selectedNpc.name } });
    } else if (subtype === 'npc-interact') {
      if (!selectedNpc) return;
      // All NPC types go through the probe — approach + click + observe response.
      onProbe(selectedNpc.name);
      setSelectedNpc(null);
      return;
    } else if (subtype === 'portal-teleport') {
      if (!selectedPortal) return;
      onAdd({
        kind: 'portal',
        position: portalCenter(selectedPortal),
      });
      setSelectedPortal(null);
      return;
    } else if (subtype === 'delay') {
      const ms = parseDelaySeconds(seconds);
      if (ms === null) {
        toast.error(VALIDATION_MSG.delayRange);
        return;
      }
      onAdd({ kind: 'delay', ms });
      setSeconds('1');
      return;
    } else if (subtype === 'script') {
      onAdd({
        kind: 'script',
        name: scriptName,
        language: 'js',
        source: DEFAULT_SCRIPT_SOURCE,
      });
      const lastStep = useAppConfigStore.getState().config.steps?.at(-1);
      if (lastStep && lastStep.kind === 'script') {
        useUIStore.getState().openStepEdit(lastStep.id);
      }
      setScriptName('');
      return;
    } else if (subtype === 'marker') {
      onAdd({ kind: 'marker', name: markerName });
      setMarkerName('');
      return;
    } else {
      const nx = parseInt(x, 10);
      const ny = parseInt(y, 10);
      if (isNaN(nx) || isNaN(ny)) return;
      onAdd({
        kind: 'walk',
        position: { x: nx, y: ny },
        mode: subtype === 'walk-exact' ? 'exact' : 'approx',
      });
    }

    // Reset to current player position
    const pos = usePlayerStore.getState().position;
    setX(String(pos.x));
    setY(String(pos.y));
    setSelectedNpc(null);
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2">
        <StepActionListbox
          value={subtype}
          onChange={handleSubtypeChange}
          ariaLabel="Tipo de passo"
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {subtype === 'script' ? (
            <TextInput
              compact
              type="text"
              placeholder="CHECK_LAN_A_RANGE_1"
              value={scriptName}
              onChange={(e) => {
                setScriptName(normalizeMarkerName((e.target as HTMLInputElement).value));
              }}
              aria-label="Nome do script"
              className="w-full font-mono text-xs"
            />
          ) : subtype === 'marker' ? (
            <TextInput
              compact
              type="text"
              placeholder="ENTER_LAN_A"
              value={markerName}
              onChange={(e) => {
                setMarkerName(normalizeMarkerName((e.target as HTMLInputElement).value));
              }}
              aria-label="Nome do marcador"
              className="w-full font-mono text-xs"
            />
          ) : subtype === 'delay' ? (
            <TextInput
              compact
              type="number"
              step="0.1"
              min={MIN_DELAY_SECONDS}
              max={MAX_DELAY_SECONDS}
              placeholder={`Segundos (${MIN_DELAY_SECONDS}–${MAX_DELAY_SECONDS})`}
              value={seconds}
              onChange={(e) => setSeconds((e.target as HTMLInputElement).value)}
              aria-label={`Tempo em segundos (mínimo ${MIN_DELAY_SECONDS}, máximo ${MAX_DELAY_SECONDS})`}
              className="w-full font-mono text-xs"
            />
          ) : isPortalSelect ? (
            <Listbox value={selectedPortal ?? undefined} onChange={setSelectedPortal}>
              <div className="relative w-full">
                <ListboxButton className="relative w-full cursor-pointer rounded-md border border-gray-600 bg-gray-800 py-1.5 pr-8 pl-2.5 text-left text-xs text-gray-100 shadow-sm transition hover:border-gray-500 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500">
                  <span className="flex items-center gap-2 truncate">
                    {selectedPortal ? (
                      <span className="truncate font-mono text-orange-200">
                        {formatPosition(portalCenter(selectedPortal))}
                      </span>
                    ) : (
                      'Selecionar portal'
                    )}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
                    <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                </ListboxButton>
              </div>

              <ListboxOptions
                anchor="bottom start"
                transition
                className="z-50 max-h-48 w-[var(--button-width)] overflow-auto rounded-md bg-gray-800 py-1 text-xs shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
              >
                {ZONE_PORTALS.map((portal) => (
                  <ListboxOption
                    key={portalKey(portal)}
                    value={portal}
                    className="group relative flex cursor-pointer items-center gap-2 px-2.5 py-1.5 font-mono text-gray-300 select-none data-[focus]:bg-blue-600 data-[focus]:text-white"
                  >
                    <span className="truncate group-data-[selected]:font-semibold">
                      {formatPosition(portalCenter(portal))}
                    </span>
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Listbox>
          ) : isNpcSelect ? (
            <Listbox value={selectedNpc ?? undefined} onChange={handleNpcSelect}>
              <div className="relative w-full">
                <ListboxButton className="relative w-full cursor-pointer rounded-md border border-gray-600 bg-gray-800 py-1.5 pr-8 pl-2.5 text-left text-xs text-gray-100 shadow-sm transition hover:border-gray-500 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500">
                  <span className="flex items-center gap-2 truncate">
                    {selectedNpc ? (
                      <>
                        <span className="truncate">
                          {selectedNpc.name} ({formatPosition(selectedNpc.position)})
                        </span>
                        <CatChip category={selectedNpc.npcCategory} size="sm" />
                      </>
                    ) : (
                      'Selecionar NPC'
                    )}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
                    <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                </ListboxButton>
              </div>

              <ListboxOptions
                anchor="bottom start"
                transition
                className="z-50 max-h-48 w-[var(--button-width)] overflow-auto rounded-md bg-gray-800 py-1 text-xs shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
              >
                {npcs.length === 0 ? (
                  <div className="px-2.5 py-1.5 text-gray-500">Nenhum NPC visivel</div>
                ) : (
                  npcs.map((npc) => (
                    <ListboxOption
                      key={npc.index}
                      value={npc}
                      className="group relative flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-gray-300 select-none data-[focus]:bg-blue-600 data-[focus]:text-white"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate group-data-[selected]:font-semibold">
                          {npc.name}
                        </span>
                        <span className="block truncate text-[10px] text-gray-500 group-data-[focus]:text-blue-200">
                          {formatPosition(npc.position)}
                        </span>
                      </span>
                      <CatChip category={npc.npcCategory} size="sm" />
                    </ListboxOption>
                  ))
                )}
              </ListboxOptions>
            </Listbox>
          ) : (
            <>
              <TextInput
                compact
                type="number"
                placeholder="X"
                value={x}
                onChange={(e) => setX((e.target as HTMLInputElement).value)}
                className="w-1/2 font-mono text-xs"
              />
              <TextInput
                compact
                type="number"
                placeholder="Y"
                value={y}
                onChange={(e) => setY((e.target as HTMLInputElement).value)}
                className="w-1/2 font-mono text-xs"
              />
            </>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={!canSubmit || probeInProgress}
          className="shrink-0 !px-2 !py-1.5 !text-xs"
        >
          {probeInProgress ? (
            <>
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
              Aguardando...
            </>
          ) : (
            <>
              <PlusIcon className="h-3.5 w-3.5" />
              Adicionar
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

import { type FC, useMemo, useState } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import {
  ArrowDownTrayIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { useAppConfigStore } from '../../stores/app-config-store';
import { useMacroLifecycleStore } from '../../stores/macro-lifecycle-store';
import { MacroStatus } from '../../stores/macro-status';
import {
  newAppConfig,
  openAppConfig,
  saveAppConfig,
  deriveNameFromPath,
} from '../../lib/app-config-io';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Tooltip } from '../shared/Tooltip';

type PendingAction = 'new' | 'open' | { kind: 'recent'; path: string } | null;

const MENU_ITEM_BASE =
  'flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-xs text-gray-200 select-none data-[focus]:bg-accent-600 data-[focus]:text-white data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-500';

export const AppConfigMenu: FC = () => {
  const { config, currentName, baselineHash, recents } = useAppConfigStore(
    useShallow((s) => ({
      config: s.config,
      currentName: s.currentName,
      baselineHash: s.baselineHash,
      recents: s.recents,
    })),
  );
  const macroStatus = useMacroLifecycleStore((s) => s.status);
  const isRunning = macroStatus === MacroStatus.Running;
  // Mutating actions (open/new/recent) swap config.steps under the live index — need a full stop.
  const mutateDisabled = macroStatus !== MacroStatus.Idle;

  const stepsCount = config.steps?.length ?? 0;
  const isDirty = useMemo(() => JSON.stringify(config) !== baselineHash, [config, baselineHash]);
  const isUnsaved = !currentName && stepsCount > 0;
  const canSave = stepsCount > 0;
  // Saving is read-only for the engine — allowed while paused, blocked only while running.
  const saveDisabled = isRunning || (!isDirty && !isUnsaved) || !canSave;

  const displayName = currentName || (isUnsaved ? 'Macro não salva' : 'Nova macro');
  const nameClass = currentName
    ? 'truncate text-xs font-semibold text-gray-100'
    : 'truncate text-xs font-semibold text-gray-400 italic';

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const requestNew = (): void => {
    if (isDirty) setPendingAction('new');
    else newAppConfig();
  };

  const requestOpen = (): void => {
    if (isDirty) setPendingAction('open');
    else void openAppConfig();
  };

  const requestRecent = (path: string): void => {
    if (isDirty) setPendingAction({ kind: 'recent', path });
    else void openAppConfig(path);
  };

  const confirmDiscard = (): void => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'new') newAppConfig();
    else if (action === 'open') void openAppConfig();
    else if (action && action.kind === 'recent') void openAppConfig(action.path);
  };

  const saveButton = (
    <Button
      variant={isDirty ? 'ghost-accent' : 'ghost'}
      size="sm"
      onClick={() => void saveAppConfig(false)}
      disabled={saveDisabled}
    >
      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
      Salvar
    </Button>
  );

  return (
    <>
      <header className="flex items-center gap-3 border-b border-gray-800 py-1.5 pr-3 pl-[var(--app-titlebar-inset,0.75rem)]">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="inline-flex shrink-0 self-center text-gray-500">
            <FolderIcon className="h-3.5 w-3.5" />
          </span>
          <span className={nameClass}>{displayName}</span>
          {isDirty && (
            <>
              <span
                className="shrink-0 text-accent-300"
                aria-label="Alterações não salvas"
                title="Alterações não salvas"
              >
                •
              </span>
              <span className="shrink-0 text-[11px] text-accent-400/80">· não salvo</span>
            </>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={requestOpen} disabled={mutateDisabled}>
            <FolderOpenIcon className="h-3.5 w-3.5" />
            Abrir
          </Button>

          {isRunning ? (
            <Tooltip
              content="Não é possível salvar enquanto o macro está rodando"
              placement="bottom"
            >
              {/* wrapper makes hover work: a native-disabled button emits no pointer events */}
              <span className="inline-flex">{saveButton}</span>
            </Tooltip>
          ) : (
            saveButton
          )}

          <Menu>
            <MenuButton as={Button} variant="ghost" size="sm" title="Mais" disabled={isRunning}>
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </MenuButton>

            <MenuItems
              anchor="bottom end"
              transition
              className="z-50 mt-1 w-56 origin-top rounded-md border border-gray-700 bg-gray-800 py-1 text-xs shadow-lg ring-1 ring-black/30 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
            >
              <MenuItem disabled={mutateDisabled}>
                <button type="button" onClick={requestNew} className={MENU_ITEM_BASE}>
                  Nova
                </button>
              </MenuItem>
              <MenuItem disabled={!canSave}>
                <button
                  type="button"
                  onClick={() => void saveAppConfig(true)}
                  className={MENU_ITEM_BASE}
                >
                  Salvar como...
                </button>
              </MenuItem>

              <div className="my-1 border-t border-gray-700" />

              <div className="px-3 py-1 text-[10px] tracking-wide text-gray-500 uppercase">
                Recentes
              </div>

              {recents.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-gray-500 italic">Nenhum recente</div>
              ) : (
                recents.map((path) => (
                  <MenuItem key={path} disabled={mutateDisabled}>
                    <button
                      type="button"
                      onClick={() => requestRecent(path)}
                      title={path}
                      className={MENU_ITEM_BASE}
                    >
                      <FolderIcon className="mr-2 h-3 w-3 shrink-0 text-gray-500" />
                      <span className="truncate">{deriveNameFromPath(path)}</span>
                    </button>
                  </MenuItem>
                ))
              )}
            </MenuItems>
          </Menu>
        </div>
      </header>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title="Descartar mudanças?"
        message="A config atual tem mudanças não salvas. Continuar irá descartá-las."
        confirmLabel="Descartar"
        onConfirm={confirmDiscard}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
};

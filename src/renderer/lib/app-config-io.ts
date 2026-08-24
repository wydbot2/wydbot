import { z } from 'zod';
import { toast } from 'sonner';
import { AppConfigV1Schema } from '@shared/app-config';
import { useAppConfigStore } from '../stores/app-config-store';
import { getWydAPI } from './electron-api';
import { logMacro } from './macro-log';
import { runSkillDivergenceCheck } from './skill-divergence-check';
import { formatConfigIssues } from './config-issue-format';
import { showConfigErrorToast } from './config-error-toast';

/** Fallback sink for NON-validation failures (fs/jail/JSON.parse) — a single line. */
const toastError = (prefix: string, err: unknown): void => {
  const raw = err instanceof Error ? err.message : String(err);
  // Electron wraps handler throws as "Error invoking remote method '…': Error: <msg>" — unwrap it.
  const msg = raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '');
  toast.error(`${prefix}: ${msg}`);
  logMacro('error', `${prefix}: ${msg}`);
};

/** Escalate a schema validation failure into the summarized toast → ConfigErrorDialog flow. */
const escalateConfigError = (
  context: 'save' | 'load',
  error: z.ZodError,
  source: unknown,
  name?: string,
): void => {
  const issues = formatConfigIssues(error, source);
  showConfigErrorToast({
    issues,
    rawJson: JSON.stringify(error.issues, null, 2),
    context,
    name,
  });
  logMacro(
    'error',
    `${context === 'load' ? 'Erro ao abrir' : 'Erro ao salvar'} config: ${issues.length} problema(s)`,
  );
};

/** Reads `path` directly when provided (Recentes); otherwise shows OS open dialog. */
export const openAppConfig = async (path?: string): Promise<void> => {
  try {
    const api = getWydAPI();
    if (!api) return;
    const result = await api.openAppConfig(path ? { path } : undefined);
    if (!result) return; // user canceled

    // Schema validation failed in main — re-validate `raw` here to regenerate the
    // ZodError (its `.issues` don't survive IPC) and surface per-issue errors.
    if (!result.ok) {
      const name = deriveNameFromPath(result.path);
      const parsed = AppConfigV1Schema.safeParse(result.raw);
      if (!parsed.success) escalateConfigError('load', parsed.error, result.raw, name);
      else toastError('Erro ao abrir config', `'${name}' não pôde ser carregada`);
      return;
    }

    const { config, path: loadedPath } = result;

    // Display name is always derived from the filename — that's what the user sees
    // in Finder/Explorer and can rename. The `config.name` field inside the JSON
    // is internal metadata and is ignored for UX.
    const displayName = deriveNameFromPath(loadedPath);
    useAppConfigStore.getState().setLoaded(loadedPath, displayName, config);
    useAppConfigStore.getState().pushRecent(loadedPath);
    toast.success(`'${displayName}' carregada`);
    runSkillDivergenceCheck();
  } catch (err) {
    // If a recent file was deleted/moved, prune it from the list
    if (path) useAppConfigStore.getState().removeRecent(path);
    toastError('Erro ao abrir config', err);
  }
};

export const saveAppConfig = async (saveAs = false): Promise<void> => {
  try {
    const api = getWydAPI();
    if (!api) return;
    const {
      config: currentConfig,
      currentPath,
      currentName,
      createdAt,
    } = useAppConfigStore.getState();
    const now = new Date().toISOString();
    const config = AppConfigV1Schema.parse({
      ...currentConfig,
      name: currentName || 'Untitled',
      createdAt: createdAt ?? now,
      updatedAt: now,
    });
    const result = await api.saveAppConfig({
      config,
      path: saveAs ? null : currentPath,
    });
    if (!result) return; // user canceled

    const store = useAppConfigStore.getState();
    store.setSaved(result.path);
    // Path changed (first save or Save As) → adopt new filename as display name.
    if (result.path !== currentPath) {
      store.setName(deriveNameFromPath(result.path));
    }
    store.pushRecent(result.path);
    toast.success('Config salva');
  } catch (err) {
    if (err instanceof z.ZodError) {
      escalateConfigError('save', err, useAppConfigStore.getState().config);
    } else {
      toastError('Erro ao salvar config', err);
    }
  }
};

export const newAppConfig = (): void => {
  useAppConfigStore.getState().newConfig();
};

/** Strip directory + extension(s) from a path to get a display-ready name. */
export const deriveNameFromPath = (path: string): string => {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.macro\.json$|\.json$/i, '');
};

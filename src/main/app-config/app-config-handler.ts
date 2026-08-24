import * as fs from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { dialog, ipcMain } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';
import { AppConfigOpenPayloadSchema, AppConfigSavePayloadSchema } from '@shared/ipc/schemas';
import {
  AppConfigV1Schema,
  VALIDATION_MSG,
  migrateLegacyAutoDropGroups,
  stripLegacyMiscReconnect,
  type AppConfigV1,
} from '@shared/app-config';
import { secureInvoke } from '@main/ipc/secure-handler';
import { getConfigDir } from './config-dir';
import { isInsideDir } from './config-paths';
import { assetsLogger } from '../logging';

const FILE_FILTERS = [{ name: 'App Config', extensions: ['json'] }];

/** realpath when the path exists (collapses OneDrive/junction redirection), else the input. */
const canonical = async (p: string): Promise<string> => {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
};

// Every path — payload-supplied AND dialog-chosen — is jailed inside the per-machine data dir.
const assertJailedPath = async (input: string): Promise<string> => {
  const configDir = await getConfigDir();
  const dataDir = await canonical(configDir);
  const resolved = resolve(input);
  const absolute = join(await canonical(dirname(resolved)), basename(resolved));
  if (!isInsideDir(dataDir, absolute)) {
    throw new Error(VALIDATION_MSG.configPathOutsideDir(configDir));
  }
  if (extname(absolute).toLowerCase() !== '.json') {
    throw new Error(VALIDATION_MSG.configPathNotJson);
  }
  return absolute;
};

/** Open + Save IPC handlers. Validation runs in main (trust boundary) AND in renderer (UX errors). */
export const registerAppConfigHandlers = (): void => {
  ipcMain.handle(
    IPC.APP_CONFIG_OPEN,
    secureInvoke(
      AppConfigOpenPayloadSchema,
      async (
        _event,
        payload,
      ): Promise<
        | { ok: true; config: AppConfigV1; path: string }
        | { ok: false; raw: unknown; path: string }
        | null
      > => {
        let path = payload?.path ? await assertJailedPath(payload.path) : undefined;

        if (!path) {
          const result = await dialog.showOpenDialog({
            title: 'Abrir macro',
            filters: FILE_FILTERS,
            properties: ['openFile'],
            defaultPath: await getConfigDir(),
          });
          if (result.canceled || result.filePaths.length === 0) return null;
          path = await assertJailedPath(result.filePaths[0]);
        }

        const raw = await fs.readFile(path, 'utf-8');
        const json: unknown = migrateLegacyAutoDropGroups(
          stripLegacyMiscReconnect(JSON.parse(raw)),
        );
        // Return invalid configs as data (issues survive IPC; a thrown ZodError would not)
        // so the renderer can render per-issue errors. Trust boundary intact: never loaded.
        const parsed = AppConfigV1Schema.safeParse(json);
        if (!parsed.success) {
          assetsLogger.warn(`App config invalid: ${path} (${parsed.error.issues.length} issues)`);
          return { ok: false, raw: json, path };
        }
        const config = parsed.data;
        assetsLogger.info(`App config loaded: ${path} (${config.steps?.length ?? 0} steps)`);
        return { ok: true, config, path };
      },
    ),
  );

  ipcMain.handle(
    IPC.APP_CONFIG_SAVE,
    secureInvoke(
      AppConfigSavePayloadSchema,
      async (_event, payload): Promise<{ path: string } | null> => {
        // payload.config is `unknown` per the envelope schema — AppConfigV1Schema is the real validation.
        let config: AppConfigV1 = AppConfigV1Schema.parse(payload.config);
        let path = payload.path !== null ? await assertJailedPath(payload.path) : null;

        if (path === null) {
          const dir = await getConfigDir();
          const result = await dialog.showSaveDialog({
            title: 'Salvar macro',
            filters: FILE_FILTERS,
            defaultPath: join(dir, `${config.name}.json`),
          });
          if (result.canceled || !result.filePath) return null;
          path = await assertJailedPath(result.filePath);
          // Make the chosen filename canonical so on-disk JSON.name matches the file.
          const name = basename(path, extname(path)) || config.name;
          config = { ...config, name, updatedAt: new Date().toISOString() };
        }

        await fs.writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
        assetsLogger.info(`App config saved: ${path}`);
        return { path };
      },
    ),
  );
};

import { logMacro } from './macro-log';

let permissionRequested = false;

const ensurePermission = async (): Promise<boolean> => {
  if (typeof Notification === 'undefined') {
    logMacro('warn', '[notif] Notification API indisponível');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  if (!permissionRequested) {
    permissionRequested = true;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      logMacro('info', '[notif] permissão concedida');
      return true;
    }
    logMacro('warn', `[notif] permissão negada: "${result}"`);
  }
  return false;
};

export const showNativeNotification = async (title: string, body: string): Promise<void> => {
  try {
    if (!(await ensurePermission())) return;
    new Notification(title, { body });
    logMacro('info', `[notif] "${title}" — exibida`);
  } catch (err) {
    logMacro(
      'error',
      `[notif] falha ao exibir: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

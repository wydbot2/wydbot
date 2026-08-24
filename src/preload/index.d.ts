import type { WydBotAPI } from '../shared/ipc/ipc-api';

declare global {
  interface Window {
    wydAPI: WydBotAPI;
  }
}

/**
 * Dev-only screenshot seeder. Fills the player store with believable values and
 * jumps straight to the in-game "Personagem" screen — no server connection
 * needed. Toggle in dev with Ctrl/Cmd+Shift+M (see use-mock-player-hotkey.ts).
 *
 * Edit MOCK_PLAYER to change what the screenshots show.
 */
import type { ServerChannel } from '@shared/constants/server-channels';
import { usePlayerStore } from '../stores/player-store';
import { useConnectionStore } from '../stores/connection-store';
import { useUIStore } from '../stores/ui-store';

/** Values shown in the screenshots — tweak freely. */
export const MOCK_PLAYER = {
  name: 'WYDBot',
  charClass: 0, // 0 TransKnight · 1 Foema · 2 BeastMaster · 3 Huntress
  evolutionTier: 2, // 0 Mortal · 1 Arch · 2 Celestial
  level: 380,
  currentHp: 12_500,
  maxHp: 12_500,
  currentMp: 8_200,
  maxMp: 8_200,
  str: 412,
  dex: 388,
  int: 156,
  con: 410,
  gold: 2_000_000_000,
} as const;

const MOCK_CHANNEL: ServerChannel = { name: 'Atlantis', ip: '127.0.0.1', port: 8281 };

let mocked = false;

/** Seed the mock values and show the in-game screen. */
export const applyMockPlayer = (overrides: Partial<typeof MOCK_PLAYER> = {}): void => {
  usePlayerStore.setState({ ...MOCK_PLAYER, ...overrides });
  useConnectionStore.setState({ status: 'connected', selectedChannel: MOCK_CHANNEL });
  useUIStore.getState().setScreen('game');
  mocked = true;
};

/** Wipe the mock and return to the login screen. */
export const clearMockPlayer = (): void => {
  usePlayerStore.getState().reset();
  useConnectionStore.getState().reset();
  useUIStore.getState().setScreen('login');
  mocked = false;
};

/** Flip between mocked and clean state. */
export const toggleMockPlayer = (): void => {
  if (mocked) clearMockPlayer();
  else applyMockPlayer();
};

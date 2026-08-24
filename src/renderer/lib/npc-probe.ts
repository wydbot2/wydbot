import type { NpcCategory, NpcEntity } from '@shared/types';
import type { ShopOpen } from '@shared/app-config';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import { gameApi } from './game-api';
import { abortableDelay } from './macro-timing';
import { approachNpc } from './macro-npc-approach';
import { probeShopOpenOrder } from './interact-service';
import { useShopStore } from '../stores/shop-store';

const PROBE_RESPONSE_TIMEOUT_MS = 3000;
const PROBE_POLL_MS = 200;

export type ProbeResult =
  | { category: 'shop'; npc: NpcEntity; items: IpcShopItem[]; open: ShopOpen }
  | { category: 'bank'; npc: NpcEntity }
  | { category: 'compose'; npc: NpcEntity }
  | { category: 'dialog'; npc: NpcEntity };

export type ProbeStatus =
  | { status: 'approaching' }
  | { status: 'probing' }
  | { status: 'done'; result: ProbeResult }
  | { status: 'error'; message: string };

const sendOpen = (npcIndex: number, open: ShopOpen): void => {
  if (open === 'npc') gameApi.npcClick(npcIndex);
  else gameApi.dialogClick(npcIndex);
};

/**
 * Wait for a new shop-inventory epoch after `sinceEpoch`, or timeout.
 */
const waitForShopInventory = async (
  signal: AbortSignal,
  sinceEpoch: number,
): Promise<IpcShopItem[] | null> => {
  const deadline = Date.now() + PROBE_RESPONSE_TIMEOUT_MS;
  try {
    while (!signal.aborted) {
      const { epoch, items } = useShopStore.getState();
      if (epoch > sinceEpoch && items.length > 0) return [...items];
      if (Date.now() >= deadline) return null;
      await abortableDelay(PROBE_POLL_MS, signal);
    }
  } catch {
    // aborted mid-delay
  }
  return null;
};

/**
 * Discovery-only dual open for shop inventory (0x17C). Persists the winning
 * `open` on the config; runtime must not re-explore.
 */
const probeShopInventory = async (
  npcIndex: number,
  wireHint: NpcCategory | undefined,
  signal: AbortSignal,
): Promise<{ items: IpcShopItem[]; open: ShopOpen } | null> => {
  for (const open of probeShopOpenOrder(wireHint)) {
    if (signal.aborted) return null;
    useShopStore.getState().clear();
    const sinceEpoch = useShopStore.getState().epoch;
    sendOpen(npcIndex, open);
    const items = await waitForShopInventory(signal, sinceEpoch);
    if (items) return { items, open };
  }
  return null;
};

/**
 * Universal NPC probe — approach, observe server response (or wire-hint for
 * C2S-less bank/compose). Shop discovery dual-attempts open and returns the
 * path that produced `0x17C`.
 */
export const probeNpc = async (
  npcName: string,
  signal: AbortSignal,
  onStatusChange?: (status: ProbeStatus) => void,
): Promise<ProbeResult> => {
  onStatusChange?.({ status: 'approaching' });

  const approach = await approachNpc(npcName, signal);
  if (signal.aborted) throw new Error('Abortado');
  if (approach.status === 'not-fresh')
    throw new Error(`NPC "${npcName}" não encontrado — verifique a posição`);
  if (approach.status === 'gone') throw new Error(`NPC "${npcName}" desapareceu`);
  if (approach.status === 'stuck')
    throw new Error(`Não foi possível chegar perto do NPC "${npcName}"`);
  if (approach.status !== 'arrived') throw new Error('Falha ao aproximar');

  const npc = approach.npc;

  // Wire hint is authoritative for C2S-less panels (nibble 2 / actionType 0x43).
  if (npc.npcCategory === 'bank') return { category: 'bank', npc };
  if (npc.npcCategory === 'compose') return { category: 'compose', npc };

  onStatusChange?.({ status: 'probing' });

  const shop = await probeShopInventory(npc.index, npc.npcCategory, signal);
  if (signal.aborted) throw new Error('Abortado');
  if (shop) return { category: 'shop', npc, items: shop.items, open: shop.open };
  return { category: 'dialog', npc };
};

export const probeResultCategory = (result: ProbeResult): NpcCategory =>
  result.category === 'dialog' ? 'unknown' : result.category;

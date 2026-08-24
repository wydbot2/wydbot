import type { ViewItem } from '@shared/types/item-types';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from './game-api';
import { stackCapOf } from './item-stack-utils';
import { logMacro } from './macro-log';
import { registerAmbientModule } from './macro-engine';
import { BAG_SIZE, isBagLocked } from '../components/game/personagem/character-tables';

const BAG = 1;

/** Skip locked-bag slots — the server silently rejects moves to/from them (no 0x182). */
const isUsableSlot = (slot: number, bagUnlock: readonly boolean[]): boolean =>
  !isBagLocked(Math.floor(slot / BAG_SIZE), bagUnlock);

interface SlotStack {
  slot: number;
  itemId: number;
  /** SANC refine level (0 when unrefined). The server refuses to merge stacks of differing refine. */
  refine: number;
  name: string;
  count: number;
  max: number;
}

interface Pending {
  itemId: number;
  refine: number;
  name: string;
  srcSlot: number;
  dstSlot: number;
  beforeSrc: number;
  beforeDst: number;
}

let pending: Pending | null = null;
let announced = false;

const mergeKey = (itemId: number, refine: number): string => `${itemId}:${refine}`;

/** Log label with the SANC suffix, so a +1 stack is distinguishable from a +0. */
const labelOf = (name: string, refine: number): string =>
  refine > 0 ? `${name} +${refine}` : name;

const describe = (item: ViewItem, slot: number): SlotStack | null => {
  if (item.index === 0) return null;
  // Immovable / non-transferable / bound (any ViewItem.immovable tier): never groupable.
  if (item.immovable) return null;
  const max = stackCapOf(item.index);
  if (max === 0) return null; // not manually stackable (canonical predicate)
  return {
    slot,
    itemId: item.index,
    refine: item.refineLevel ?? 0,
    name: item.displayName || item.name,
    // Live count is wire bytes 2-3 → ViewItem.stackCount, display-gated to
    // undefined when ≤1; treat absence as 1.
    count: item.stackCount ?? 1,
    max,
  };
};

/** One mergeable pair: drain the smallest stack into the largest (same item AND same refine). */
const findPair = (
  inventory: ViewItem[],
  bagUnlock: readonly boolean[],
): { src: SlotStack; dst: SlotStack } | null => {
  // Key by itemId + refine: the server only consolidates byte-identical stacks,
  // so a +1 and a +0 of the same item must never be paired (it no-ops forever).
  const byKey = new Map<string, SlotStack[]>();
  inventory.forEach((item, slot) => {
    if (!isUsableSlot(slot, bagUnlock)) return;
    const s = describe(item, slot);
    if (!s) return;
    const key = mergeKey(s.itemId, s.refine);
    const arr = byKey.get(key);
    if (arr) arr.push(s);
    else byKey.set(key, [s]);
  });

  for (const stacks of byKey.values()) {
    const partials = stacks.filter((s) => s.count < s.max);
    if (partials.length < 2) continue;
    partials.sort((a, b) => a.count - b.count);
    return { src: partials[0], dst: partials[partials.length - 1] };
  }
  return null;
};

/** Reads the prior MOVE's outcome. Returns true iff the server merged (dst grew, src shrank). */
const verify = (): boolean => {
  if (!pending) return false;
  const inv = usePlayerStore.getState().inventory;
  const src = inv[pending.srcSlot];
  const dst = inv[pending.dstSlot];
  const afterSrc = src && src.index === pending.itemId ? (src.stackCount ?? 1) : 0;
  const afterDst = dst && dst.index === pending.itemId ? (dst.stackCount ?? 1) : 0;
  const merged = afterDst > pending.beforeDst && afterSrc < pending.beforeSrc;
  if (merged) {
    const label = labelOf(pending.name, pending.refine);
    const done = afterSrc === 0 || afterDst === pending.beforeSrc + pending.beforeDst;
    logMacro(
      'info',
      `[agrupamento] ${label}: src ${pending.beforeSrc}→${afterSrc}, dst ${pending.beforeDst}→${afterDst}${done ? ' (consolidado)' : ' (servidor agrupando…)'}`,
    );
  }
  pending = null;
  return merged;
};

registerAmbientModule({
  name: 'auto-stack',
  pollIntervalMs: 5_000,
  lifecycle: 'always-on',

  tick: async (signal) => {
    if (signal.aborted) return;
    if (!(useAppConfigStore.getState().config.misc?.autoStack?.enabled ?? false)) return;

    if (!announced) {
      announced = true;
      logMacro('info', '[agrupamento] ativo — observando a mochila');
    }

    // Verify the prior MOVE; on a confirmed merge, fall through to queue the next pair this tick.
    if (pending) {
      if (!verify()) return; // not merged (echo not applied / refused) → re-plan next cycle
    }

    const { inventory, bagUnlock } = usePlayerStore.getState();
    const pair = findPair(inventory, bagUnlock);
    if (!pair) return;

    const { src, dst } = pair;
    pending = {
      itemId: src.itemId,
      refine: src.refine,
      name: src.name,
      srcSlot: src.slot,
      dstSlot: dst.slot,
      beforeSrc: src.count,
      beforeDst: dst.count,
    };
    logMacro(
      'info',
      `[agrupamento] ${labelOf(src.name, src.refine)}: slot ${src.slot}(${src.count}) → slot ${dst.slot}(${dst.count}), max ${dst.max}`,
    );
    // 0x376 onto the OCCUPIED same-item DST stack → server consolidates and
    // replies 0x182 sub=1 ×2. See .
    gameApi.itemMove(BAG, src.slot, BAG, dst.slot);
  },

  reset: () => {
    pending = null;
    announced = false;
  },
});

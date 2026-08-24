import { type AutoDropAttr, type AutoDropAttrOp, type AutoDropRule } from '@shared/app-config';
import type { IpcServerMessage } from '@shared/ipc/ipc-api';
import type { ViewItem } from '@shared/types/item-types';
import { useAppConfigStore } from '../stores/app-config-store';
import { usePlayerStore } from '../stores/player-store';
import { getWydAPI } from './electron-api';
import { gameApi } from './game-api';
import { effectTooltipComparable } from './item-enrich';
import { registerAmbientModule } from './macro-engine';
import { logMacro } from './macro-log';

const POLL_MS = 800;

/** Max destroys per second — flood guard against the server per-category cooldown. */
const MAX_DROPS_PER_SEC = 2;

/** How long an emit stays attributable to a (slot-less) `0x105` discard reject. */
const RECENT_EMIT_KEEP_MS = 3000;

/** `0x105` ServerMessage code for "Este item não pode ser descartado.". */
const SERVER_MSG_CODE_DISCARD_REJECTED = 73;

/** slot → occupancy signature; `null` until the first tick primes it. */
let snapshot: Map<number, string> | null = null;
/** FIFO of recent destroy emits — attributes a slot-less `0x105` reject. */
let recentEmits: { itemId: number; ts: number }[] = [];
/** Sliding 1s window of emit timestamps for rate-limit. */
let dropTimestamps: number[] = [];
/** Item ids the server refused (cód 73). Never re-tried this session. */
const blockedItemIds = new Set<number>();
let unsubServerMessage: (() => void) | null = null;
/** Slots that failed the rate-limit last tick — re-evaluate on the next. */
const pendingSweep = new Set<number>();
/**
 * Watermark of the store's `inventoryFullSyncAt` (0x114 full-grid rewrite).
 * `null` until the first tick adopts it — a module started after world-enter
 * must NOT treat that entry as a fresh resync.
 */
let lastFullSyncAt: number | null = null;
/**
 * Fingerprint of the last rules set we primed against. When rules change while
 * the module is already running (UI edit or config load that keeps `enabled`),
 * the next tick must re-prime so pre-existing inventory is re-evaluated —
 * otherwise only new arrivals would see the new blacklist.
 */
let rulesFingerprint: string | null = null;

/** Stable rules key for change detection (order + attrs matter). */
const fingerprintRules = (rules: AutoDropRule[]): string => JSON.stringify(rules);

/** Empty slot ⇒ `index === 0` (item-enrich convention). */
const sigOf = (item: ViewItem): string =>
  item.index === 0 ? '' : `${item.index}:${item.stackCount ?? 1}`;

const isArrival = (prev: string, cur: string): boolean => {
  if (cur === '') return false;
  if (prev === '') return true;
  const [pId, pCount] = prev.split(':');
  const [cId, cCount] = cur.split(':');
  // Different item in the same slot ⇒ the swap itself is the arrival.
  if (pId !== cId) return true;
  // Same item, larger stack ⇒ stackable loot merged into an existing stack.
  return Number(cCount) > Number(pCount);
};

/** Numeric comparison ops — `absent`/`present` are handled before `cmp` is reached. */
type NumericAttrOp = Exclude<AutoDropAttrOp, 'absent' | 'present'>;

const cmp = (op: NumericAttrOp, a: number, b: number): boolean => {
  switch (op) {
    case '>=':
      return a >= b;
    case '>':
      return a > b;
    case '=':
      return a === b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
  }
};

/**
 * Only wire effects count: a loot ADD shares the base attribute's effect index
 * (e.g. a bow's base `Aumento de Dano 258` and its ADD `27` are both DAMAGE=2 in
 * `ViewItem.effects`, distinguished by `source`). Base lines must NOT satisfy
 * rule predicates — rules target the rolled ADDs only.
 *
 * Values are converted to tooltip-comparable units (`effectTooltipComparable`)
 * so thresholds match what the inventory tooltip shows (e.g. ATTSPEED 110 → 11).
 * Empty when the item has no such ADD.
 */
const wireAddValues = (item: ViewItem, index: number): number[] =>
  item.effects
    .filter((e) => e.index === index && e.source === 'wire')
    .map((e) => effectTooltipComparable(index, e.value));

const attrMatches = (attr: AutoDropAttr, values: number[]): boolean => {
  const op = attr.op;
  if (op === 'absent') return values.length === 0;
  if (op === 'present') return values.length > 0;
  // Missing ADD ⇒ treated as 0 (e.g. `SPECIALALL < 21` matches an item with no such ADD).
  const comparable = values.length === 0 ? [0] : values;
  return comparable.some((v) => cmp(op, v, attr.value));
};

const matchesAll = (attrs: AutoDropAttr[], item: ViewItem): boolean =>
  attrs.every((a) => attrMatches(a, wireAddValues(item, a.index)));

/**
 * Rule matches the item iff the itemId matches AND the delete side fires AND
 * the veto side does not. Delete side: OR of AND groups — any fully-matched
 * `dropGroups` group makes the item a candidate (empty list ⇒ "qualquer
 * instância"). Veto side: any fully-matched `keepGroups` group KEEPS the item
 * (e.g. `SPECIALALL >= 39` protects a high roll).
 */
const ruleMatches = (rule: AutoDropRule, item: ViewItem): boolean => {
  if (rule.itemId !== item.index) return false;
  const drops = rule.dropGroups;
  const dropHit = drops.length === 0 || drops.some((g) => matchesAll(g, item));
  if (!dropHit) return false;
  return !(rule.keepGroups ?? []).some((g) => g.length > 0 && matchesAll(g, item));
};

/**
 * `0x105` code 73 = "Este item não pode ser descartado.". The wire response
 * carries no slot info, so we attribute it to the oldest recent emit (FIFO) and
 * blocklist that itemId for the session (it won't be auto-dropped again).
 */
const onServerMessage = (msg: IpcServerMessage): void => {
  if (msg.code !== SERVER_MSG_CODE_DISCARD_REJECTED) return;
  const oldest = recentEmits.shift();
  if (!oldest) return;
  blockedItemIds.add(oldest.itemId);
  logMacro(
    'warn',
    `[auto-drop] item id=${oldest.itemId} rejeitado (cód 73) — adicionado à blocklist da sessão`,
  );
};

const mountListeners = (): void => {
  const api = getWydAPI();
  if (!api) return;
  if (unsubServerMessage === null) unsubServerMessage = api.onServerMessage(onServerMessage);
};

/** True iff we're under `MAX_DROPS_PER_SEC`. Maintains the sliding window. */
const rateLimitOk = (now: number): boolean => {
  dropTimestamps = dropTimestamps.filter((t) => now - t < 1000);
  return dropTimestamps.length < MAX_DROPS_PER_SEC;
};

registerAmbientModule({
  name: 'auto-drop',
  pollIntervalMs: POLL_MS,
  lifecycle: 'always-on',

  tick: async (signal) => {
    if (signal.aborted) return;
    mountListeners();

    const cfg = useAppConfigStore.getState().config.misc?.autoDrop;
    if (!cfg?.enabled) return;

    // Rules changed while running → drop the snapshot so this tick re-primes
    // and re-evaluates every occupied slot against the new blacklist.
    const fp = fingerprintRules(cfg.rules);
    if (rulesFingerprint !== fp) {
      rulesFingerprint = fp;
      snapshot = null;
    }

    const inventory = usePlayerStore.getState().inventory;
    if (inventory.length === 0) return;

    const isPrimeTick = snapshot === null;

    const next = new Map<number, string>();
    const arrivals: number[] = [];
    for (let slot = 0; slot < inventory.length; slot++) {
      const cur = sigOf(inventory[slot]);
      next.set(slot, cur);
      if (isPrimeTick) {
        if (cur !== '') arrivals.push(slot);
      } else if (snapshot && isArrival(snapshot.get(slot) ?? '', cur)) {
        arrivals.push(slot);
      }
    }

    // Genuine full-grid resync (0x114) ⇒ adopt the new state, evaluate nothing:
    // diffs against a re-presented bag are not loot. Before the pendingSweep
    // merge so the rate-limit backlog survives the resync.
    const fullSyncAt = usePlayerStore.getState().inventoryFullSyncAt;
    if (lastFullSyncAt === null) {
      lastFullSyncAt = fullSyncAt;
    } else if (fullSyncAt > lastFullSyncAt) {
      lastFullSyncAt = fullSyncAt;
      snapshot = next;
      logMacro('info', '[auto-drop] resync de inventário (0x114) — avaliação suprimida');
      return;
    }

    for (const slot of pendingSweep) {
      if (inventory[slot]?.index !== 0 && !arrivals.includes(slot)) arrivals.push(slot);
    }
    pendingSweep.clear();

    const now = Date.now();
    recentEmits = recentEmits.filter((e) => now - e.ts < RECENT_EMIT_KEEP_MS);

    const destroyedSlots: number[] = [];
    for (const slot of arrivals) {
      const item = inventory[slot];
      if (blockedItemIds.has(item.index)) continue;
      if (!cfg.rules.some((r) => ruleMatches(r, item))) continue;
      if (!rateLimitOk(now)) {
        pendingSweep.add(slot);
        continue;
      }

      dropTimestamps.push(now);
      recentEmits.push({ itemId: item.index, ts: now });
      gameApi.itemDestroy(slot, item.index);
      destroyedSlots.push(slot);
      logMacro('info', `[auto-drop] descartado: slot ${slot} id=${item.index} "${item.name}"`);
    }

    for (const slot of destroyedSlots) next.set(slot, '');

    snapshot = next;
  },

  reset: () => {
    unsubServerMessage?.();
    unsubServerMessage = null;
    snapshot = null;
    recentEmits = [];
    dropTimestamps = [];
    blockedItemIds.clear();
    pendingSweep.clear();
    lastFullSyncAt = null;
    rulesFingerprint = null;
  },
});

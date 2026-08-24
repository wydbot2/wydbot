import type { EntityCategory, NpcCategory } from '@shared/types';

const NPC_EQUIP0_OVERRIDES: ReadonlySet<number> = new Set([
  0x33, 0x36, 0x37, 0x38, 0x39, 0x43, 0x44,
]);

/**
 * Composition (Item-Mix) NPC marker. The game opens the compose
 */
const COMPOSE_ACTION_TYPE = 0x43;

export interface DiscriminatorInput {
  index: number;
  mobClassNibble: number;
  actionType: number;
}

/**
 * extended to split index < 1000 entries into self vs other player using
 * session state.
 */
export const discriminate = (
  input: DiscriminatorInput,
  playerMobIndex: number | null,
): EntityCategory => {
  if (playerMobIndex !== null && input.index === playerMobIndex) return 'player_self';
  if (input.index < 1000) return 'player_other';
  const nibble = input.mobClassNibble & 0x0f;
  if (nibble >= 1 && nibble <= 0x0e) return 'npc';
  if (NPC_EQUIP0_OVERRIDES.has(input.actionType)) return 'npc';
  return 'monster';
};

/**
 * Wire-side service hint from CreateMob (nibble / actionType). Display + probe
 * order only — not interact-step SoT (`resolveInteractService` / payloads).
 * bank=nibble 2, compose=actionType 0x43, shop=nibble 3 (hint only), else unknown.
 */
export const classifyNpcCategory = (
  _name: string,
  actionType?: number,
  mobClassNibble?: number,
): NpcCategory => {
  if (actionType === COMPOSE_ACTION_TYPE) return 'compose';
  const nibble = (mobClassNibble ?? 0) & 0x0f;
  if (nibble === 2) return 'bank';
  if (nibble === 3) return 'shop';
  return 'unknown';
};

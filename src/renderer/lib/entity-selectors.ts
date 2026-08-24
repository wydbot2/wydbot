import { useShallow } from 'zustand/react/shallow';
import type { Entity, NpcEntity, MonsterEntity, OtherPlayerEntity } from '@shared/types';
import { useGameStore } from '../stores/game-store';
import { usePlayerStore } from '../stores/player-store';
import { ACTION_HORIZON_DEFAULT, isEntityActionable, isEntityPresent } from './entity-freshness';

/** Pet/summon owned by another player. Server suffixes the owner's pet name with `^`. */
export const isSummon = (e: Entity): boolean => e.name.endsWith('^');

/**
 * Typed selectors over `useGameStore.entities[]`. Each filters by category
 * via type-guard predicate, so consumers receive narrow variant arrays — no
 * runtime category re-checks, no manual cast.
 *
 * UI hooks use the human-action gate (teleport reconfirm + horizon). Name /
 * party discovery uses `isEntityPresent` only — approach/walk closes distance.
 * `useShallow` keeps re-render isolated to category-relevant changes.
 */

const useActionableEntities = <T extends Entity>(category: T['category']): T[] => {
  const lastTeleportMs = usePlayerStore((player) => player.lastTeleportMs);
  const playerPos = usePlayerStore((player) => player.position);
  return useGameStore(
    useShallow((game) =>
      game.entities.filter(
        (entity): entity is T =>
          entity.category === category &&
          isEntityActionable(entity, {
            lastTeleportMs,
            playerPos,
            horizon: ACTION_HORIZON_DEFAULT,
          }),
      ),
    ),
  );
};

export const useNpcs = (): NpcEntity[] => useActionableEntities<NpcEntity>('npc');
export const useMonsters = (): MonsterEntity[] => useActionableEntities<MonsterEntity>('monster');
export const useOtherPlayers = (): OtherPlayerEntity[] =>
  useActionableEntities<OtherPlayerEntity>('player_other');

/**
 * Non-hook NPC name lookup for engine handlers (`getState()`, no React
 * subscription). Teleport-fresh + living only — no horizon so approach can
 * walk to a bank/service NPC across the map after pad land.
 */
export const findNpcsByName = (name: string): NpcEntity[] => {
  const lastTeleportMs = usePlayerStore.getState().lastTeleportMs;
  return useGameStore
    .getState()
    .entities.filter(
      (e): e is NpcEntity =>
        e.category === 'npc' && e.name === name && isEntityPresent(e, lastTeleportMs),
    );
};

/**
 * Non-hook other-player list for engine/module handlers (e.g. auto-group).
 * Teleport-fresh + living; no horizon — invite targets may stand outside combat
 * attention while still in AOI.
 */
export const getOtherPlayers = (): OtherPlayerEntity[] => {
  const lastTeleportMs = usePlayerStore.getState().lastTeleportMs;
  return useGameStore
    .getState()
    .entities.filter(
      (e): e is OtherPlayerEntity =>
        e.category === 'player_other' && isEntityPresent(e, lastTeleportMs),
    );
};

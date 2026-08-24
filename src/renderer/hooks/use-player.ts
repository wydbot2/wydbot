import { useShallow } from 'zustand/react/shallow';
import type { MPosition } from '@shared/types';
import { usePlayerStore } from '../stores/player-store';
import { gameApi } from '../lib/game-api';

export const usePlayer = () => {
  const store = usePlayerStore(
    useShallow((s) => ({
      name: s.name,
      guildIndex: s.guildIndex,
      charClass: s.charClass,
      clientIndex: s.clientIndex,
      mobIndex: s.mobIndex,
      gold: s.gold,
      exp: s.exp,
      cp: s.cp,
      statusPoint: s.statusPoint,
      cpPoint: s.cpPoint,
      skillPoint: s.skillPoint,
      criticalRate: s.criticalRate,
      saveMana: s.saveMana,
      attackSpeed: s.attackSpeed,
      pvpDamage: s.pvpDamage,
      pvpDefense: s.pvpDefense,
      resist: s.resist,
      accuracy: s.accuracy,
      evasion: s.evasion,
      penetration: s.penetration,
      absorption: s.absorption,
      critDamageBonus: s.critDamageBonus,
      critDamageReduction: s.critDamageReduction,
      gameMode: s.gameMode,
      evolutionTier: s.evolutionTier,
      skillSlots: s.skillSlots,
      position: s.position,
      level: s.level,
      currentHp: s.currentHp,
      maxHp: s.maxHp,
      currentMp: s.currentMp,
      maxMp: s.maxMp,
      str: s.str,
      int: s.int,
      dex: s.dex,
      con: s.con,
      damage: s.damage,
      defense: s.defense,
      movementSpeed: s.movementSpeed,
      affects: s.affects,
      affectsSyncMs: s.affectsSyncMs,
      equip: s.equip,
      inventory: s.inventory,
      bagUnlock: s.bagUnlock,
      mount: s.mount,
      special: s.special,
    })),
  );

  return {
    ...store,

    // Actions
    move: (destination: MPosition) => {
      const { movementSpeed } = usePlayerStore.getState();
      void gameApi.move(destination, movementSpeed).catch(() => {
        // UI fire-and-forget; timeout or abort is fine to ignore here
      });
    },
    logout: () => gameApi.charLogout(),
  };
};

import type { MSelChar } from '@shared/types/game-structures';
import type { ViewSelChar, Entity } from '@shared/types/game-types';
import { DIR_DELTA, type DirectionCode } from '@shared/ipc/walkability';
import type {
  IpcCharToWorld,
  IpcMobMove,
  IpcRefreshScore,
  IpcMobHpSync,
  IpcPlayerHpMpSync,
  IpcMobDeath,
  IpcMobDeathState,
  IpcMobStateDelta,
  IpcMobResync,
  IpcDespawnByObjectId,
  IpcSingleAttackInbound,
  IpcChatMessage,
  IpcNpcMenuData,
  IpcSlotDeltaUpdate,
} from '@shared/ipc/ipc-api';
import {
  discriminate,
  classifyNpcCategory,
  type ParsedCharToWorld,
  type ParsedCreateMob,
  type ParsedMove,
  type ParsedRefreshScore,
  type ParsedCompactHpMpSync,
  type ParsedDamageEvent,
  type ParsedMobDeath,
  type ParsedMobDeathState,
  type ParsedMobStateDelta,
  type ParsedMobResync,
  type ParsedDespawnByObjectId,
  type ParsedSingleAttackInbound,
  type ParsedChatMessage,
  type ParsedNpcMenuData,
  type ParsedSlotDeltaUpdate,
} from '@main/protocol';

// Electron IPC cannot serialize bigint, so exps must be converted to number
export const transformSelCharForIpc = (selChar: MSelChar): ViewSelChar => ({
  ...selChar,
  exps: selChar.exps.map((e) => Number(e)),
  equips: selChar.equips.map((e) => ({ items: e.items })),
});

export const transformCharToWorldForIpc = (parsed: ParsedCharToWorld): IpcCharToWorld => ({
  position: parsed.position,
  finalScore: parsed.finalScore,
  name: parsed.name,
  guildIndex: parsed.guildIndex,
  charClass: parsed.charClass,
  gold: parsed.gold,
  exp: Number(parsed.exp),
  clientIndex: parsed.clientIndex,
  affects: parsed.affects,
  mobIndex: parsed.mobIndex,
  equip: parsed.equip.items,
  inventory: parsed.inventory,
  bagUnlock: parsed.bagUnlock,
  statusPoint: parsed.statusPoint,
  cpPoint: parsed.cpPoint,
  skillPoint: parsed.skillPoint,
  criticalRate: parsed.criticalRate,
  saveMana: parsed.saveMana,
  attackSpeed: parsed.attackSpeed,
  pvpDamage: parsed.pvpDamage,
  pvpDefense: parsed.pvpDefense,
  resist: parsed.resist,
  gameMode: parsed.gameMode,
  skillSlots: parsed.skillSlots,
  cp: parsed.cp,
  evolutionTier: parsed.evolutionTier,
  learnedSkill: parsed.learnedSkill,
});

/**
 * Drops wire residue (`mobClassNibble`, `actionType`, `mobType`, `tab`)
 * consumed by the discriminator. Returns `null` for `'player_self'` —
 * caller skips the IPC send (local-player state comes from `CharToWorld`).
 */
export const transformCreateMobForIpc = (
  data: ParsedCreateMob,
  playerMobIndex: number | null,
): Entity | null => {
  const category = discriminate(data, playerMobIndex);
  // WYD2 server sometimes emits names with trailing whitespace (e.g. "Cursed Templar ").
  // Normalize at the IPC boundary so all consumers see clean strings.
  const name = data.name.trim();
  switch (category) {
    case 'player_self':
      return null;
    case 'npc':
      return {
        category: 'npc',
        index: data.index,
        name,
        position: data.position,
        npcCategory: classifyNpcCategory(name, data.actionType, data.mobClassNibble),
        composeRoot: data.composeRoot,
        equipModelIds: data.items,
      };
    case 'monster':
      return {
        category: 'monster',
        index: data.index,
        name,
        position: data.position,
        score: data.score,
        equipModelIds: data.items,
      };
    case 'player_other':
      return {
        category: 'player_other',
        index: data.index,
        name,
        position: data.position,
        score: data.score,
        guildIndex: data.guildIndex,
      };
  }
};

/** Parse a `0x36C` command string into direction codes (filters padding/garbage bytes). */
export const commandToCodes = (command: string): DirectionCode[] => {
  const codes: DirectionCode[] = [];
  for (let i = 0; i < command.length; i++) {
    const c = command.charCodeAt(i);
    if (c in DIR_DELTA) codes.push(c as DirectionCode);
  }
  return codes;
};

export const transformMoveForMobIpc = (data: ParsedMove): IpcMobMove => ({
  clientId: data.header.clientId,
  lastPosition: data.lastPosition,
  destiny: data.destiny,
  moveType: data.moveType,
  speedMove: data.speedMove,
  codes: commandToCodes(data.command),
});

export const transformRefreshScoreForIpc = (data: ParsedRefreshScore): IpcRefreshScore => ({
  score: data.score,
  currentHp: data.currentHp,
  currentMp: data.currentMp,
  clientId: data.header.clientId,
  criticalRate: data.criticalRate,
  saveMana: data.saveMana,
  attackSpeed: data.attackSpeed,
  accuracy: data.accuracy,
  evasion: data.evasion,
  penetration: data.penetration,
  absorption: data.absorption,
  critDamageBonus: data.critDamageBonus,
  critDamageReduction: data.critDamageReduction,
  pvpDamage: data.pvpDamage,
  pvpDefense: data.pvpDefense,
  affects: data.affects,
});

// Remote 0x336: per-entity HP/MP is the ALL-scope `score` block, not the LOCAL `currentHp` globals.
export const transformRefreshScoreToMobHpSync = (data: ParsedRefreshScore): IpcMobHpSync => ({
  clientId: data.header.clientId,
  currHp: data.score.currHp,
  currMp: data.score.currMp,
});

export const transformCompactHpMpSyncToMobHpSync = (data: ParsedCompactHpMpSync): IpcMobHpSync => ({
  clientId: data.header.clientId,
  currHp: data.currHp,
  currMp: data.currMp,
});

export const transformCompactHpMpSyncToPlayerHpMp = (
  data: ParsedCompactHpMpSync,
): IpcPlayerHpMpSync => ({ currentHp: data.currHp, currentMp: data.currMp });

export const transformDamageEventToPlayerHpMp = (data: ParsedDamageEvent): IpcPlayerHpMpSync => ({
  currentHp: data.currHp,
});

export const transformMobDeathForIpc = (data: ParsedMobDeath): IpcMobDeath => ({
  killed: data.killed,
  killer: data.killer,
  exp: Number(data.exp),
});

export const transformMobDeathStateForIpc = (data: ParsedMobDeathState): IpcMobDeathState => ({
  entityId: data.entityId,
  state: data.state,
});

export const transformMobStateDeltaForIpc = (data: ParsedMobStateDelta): IpcMobStateDelta => ({
  entityId: data.entityId,
  subType: data.subType,
});

export const transformMobResyncForIpc = (data: ParsedMobResync): IpcMobResync => ({
  entityId: data.entityId,
});

export const transformDespawnByObjectIdForIpc = (
  data: ParsedDespawnByObjectId,
): IpcDespawnByObjectId => ({
  objectId: data.objectId,
});

export const transformSingleAttackInboundForIpc = (
  data: ParsedSingleAttackInbound,
): IpcSingleAttackInbound => ({
  attackerIndex: data.attackerIndex,
  targets: data.targets,
  skillCode: data.skillCode,
});

export const transformChatMessageForIpc = (data: ParsedChatMessage): IpcChatMessage => ({
  message: data.message,
  clientId: data.header.clientId,
});

export const transformNpcMenuDataForIpc = (data: ParsedNpcMenuData): IpcNpcMenuData => ({
  question: data.question,
  answers: [...data.answers],
});

/** Passthrough: payload is already wire-shape POD (no bigint, no Buffer). Kept for layer symmetry. */
export const transformSlotDeltaUpdateForIpc = (
  data: ParsedSlotDeltaUpdate,
): IpcSlotDeltaUpdate => ({
  subType: data.subType,
  slotIndex: data.slotIndex,
  item: data.item,
});

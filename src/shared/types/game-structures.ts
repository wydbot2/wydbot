import type { MEquip, MInventory } from './item-types';

export enum ECharClass {
  TK = 0,
  FM = 1,
  BM = 2,
  HT = 3,
}

export interface MPosition {
  x: number;
  y: number;
}

export interface MScore {
  level: number;
  defense: number;
  damage: number;
  merchant: number;
  movementSpeed: number;
  direction: number;
  chaosRate: number;
  maxHp: number;
  maxMp: number;
  currHp: number;
  currMp: number;
  str: number;
  int: number;
  dex: number;
  con: number;
  special: [number, number, number, number];
}

/** @size 4 bytes on wire (UInt16LE id + UInt16LE value) */
export interface MSkillEntry {
  id: number;
  value: number;
}

export interface MMobPointsLeft {
  status: number;
  special: number;
  skill: number;
}

export interface MMobCore {
  name: string;
  clan: number;
  merchant: number;
  guild: number;
  charClass: ECharClass;
  rsv: number;
  quest: number;
  coin: number;
  exp: bigint;
  stellarGemPosition: MPosition;
  baseScore: MScore;
  finalScore: MScore;
  equip: MEquip;
  inventory: MInventory;
  learnedSkill: [number, number]; // [Learn[0] @ +0xF20, Learn[1] @ +0xF24]
  magic: number;
  pointsLeft: MMobPointsLeft;
  attackSpeed: number;
  pvpDamage: number;
  pvpDefense: number;
  saveMana: number;
  skillbar: number;
  skillbar1: number;
  skillbar2: number;
  skillbar3: number;
  guildMemberType: number;
  hpRegen: number;
  mpRegen: number;
  resistFire: number;
  resistIce: number;
  resistThunder: number;
  resistMagic: number;
}

export interface MobName {
  name: string;
}

export interface MSelChar {
  posX: number[];
  posY: number[];
  names: MobName[];
  scores: MScore[];
  equips: MEquip[];
  /** Per-character TransformId (morph visual id; 0 = none). Renders the morphed model on char-select. */
  transformIds: number[];
  guilds: number[];
  coins: number[];
  exps: bigint[];
}

export interface MPacketHeader {
  size: number;
  key: number;
  checkSum: number;
  opcode: number;
  clientId: number;
  timeStamp: number;
}

export const PACKET_HEADER_SIZE = 12;

export interface MSpellData {
  name: string;
  points: number;
  target: number;
  mana: number;
  delay: number;
  range: number;
  instanceType: number;
  instanceValue: number;
  tickType: number;
  tickValue: number;
  affectType: number;
  affectValue: number;
  time: number;
  instanceAttribute: number;
  tickAttribute: number;
  aggressive: number;
  maxTarget: number;
  partyCheck: number;
  affectResist: number;
  passiveCheck: number;
  forceDamage: number;
}

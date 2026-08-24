/**
 * Item Effect Index mapping.
 *
 * Índices da tabela global de nomes de efeito do client (255 entries × 24 bytes).
 *
 * Dois tipos de efeito por item:
 * - Bônus (ex: STR=7) → acumula valores de todos os slots, com level scaling
 * - Requisito (ex: REQ_STR=22) → leitura direta, sem scaling
 *
 * Efeitos puramente aditivos (STR, INT, DEX, CON, SPECIAL1-4, etc.) acumulam
 * valores de todos os slots com scaling normal.
 */
export const MItemDefinition = {
  NONE: 0,
  LEVEL: 1, // Excluído de scaling
  DAMAGE: 2, // Dano físico base. Alias→0x49 para bows com gem 'I'
  AC1: 3, // Bônus defesa
  HP: 4, // Tooltip display, character panel
  MP: 5, // Tooltip display, character panel
  EXP: 6, // Bônus EXP
  STR: 7, // Bônus STR (+valor)
  INT: 8, // Bônus INT (+valor)
  DEX: 9, // Bônus DEX (+valor)
  CON: 10, // Bônus CON (+valor)
  SPECIAL1: 11, // Bônus Special 1 (weapon mastery)
  SPECIAL2: 12,
  SPECIAL3: 13,
  SPECIAL4: 14,
  SCORE14: 15,
  SCORE15: 16,
  POS: 17, // SLOT_TYPE (bitmask slot equip): (val >> slot) & 1
  CLASS: 18, // RACE (bitmask classe/raça): (val >> class/10) & 1
  R1SIDC: 19,
  R2SIDC: 20,
  WTYPE: 21, // CLASS/SUBTYPE, categoria item/mastery. Shield penalty 100/130/150%
  REQ_STR: 22, // Requisito: checado contra STR base do personagem
  REQ_INT: 23, // Requisito: checado contra INT base do personagem
  REQ_DEX: 24, // Requisito: checado contra DEX base do personagem
  REQ_CON: 25, // Requisito: checado contra CON base do personagem
  ATTSPEED: 26, // Recebe SANC scaling. Remap value==1→100. Display "%d.%d" (value/10, value%10)
  RANGE: 27,
  MAGIC_CRIT: 28,
  RUNSPEED: 29, // SOCKET_COUNT (cap a 2, +1 se score ≥ 9)
  SPELL: 30, // return level × value, bypass scaling
  DURATION: 31, // return level × value, bypass scaling
  PARM2: 32,
  GRID: 33,
  GROUND: 34,
  CLAN: 35, // Bônus com scaling (sem remap)
  HWORDCOIN: 36, // CRAFT_MAT_HIGH (material ID high byte)
  LWORDCOIN: 37, // CRAFT_MAT_LOW (material ID low byte)
  VOLATILE: 38, // ITEM_GRADE (qualidade 0-5, 10=soulbound)
  KEYID: 39,
  EVASION: 40,
  HITRATE: 41,
  CRITICAL: 42, // EFFECT_G, alias→0x47 se gem 'G' presente
  SANC1: 43,
  SAVEMANA: 44,
  HPADD: 45, // EFFECT_E, alias→0x45 se gem 'E'
  MPADD: 46, // EFFECT_F, alias→0x46 se gem 'F'
  REGENHP: 47, // SCALE_BY_LEVEL_1 (retorna score × value)
  REGENMP: 48, // SCALE_BY_LEVEL_2 (retorna score × value)
  RESIST1: 49,
  RESIST2: 50,
  RESIST3: 51,
  RESIST4: 52,
  ACADD: 53, // EFFECT_H, alias→0x48 se gem 'H' presente
  RESISTALL: 54, // Bônus de montaria (mount type 0x17 only)
  BONUS: 55,
  PVPDAMAGE: 56, // PHYS_ATTACK_SPEED. Mask &0xFF só se level==0; refinado→valor completo. Display "%d.%d"
  PVPAC: 57, // MAGIC_ATTACK_SPEED. Mask &0xFF só se level==0; refinado→valor completo. Display "%d.%d"
  QUEST: 58,
  UNIQUE: 59,
  MAGIC: 60, // MAGIC_DAMAGE, mount types 0x16/0x17
  AMOUNT: 61,
  UNIQUEINDEX: 62,
  LWORDINDEX: 63,
  INIT1: 64,
  INIT2: 65,
  INIT3: 66,
  DAMAGEADD: 67, // RESTRICTED_1, pré-check sub-type 0x29-0x32
  MAGICADD: 68, // RESTRICTED_2, mesmo pré-check que 0x43
  HPADD2: 69,
  MPADD2: 70,
  CRITICAL2: 71,
  ACADD2: 72,
  DAMAGE2: 73, // WEAPON_SPECIAL, cálculo dual-wield (slots 6/7)
  SPECIALALL: 74,
  CURKILL: 75,
  LTOTKILL: 76,
  HTOTKILL: 77,
  INCUBATE: 78, // MOUNT_FLAG, bypass scaling
  MOUNTLIFE: 79, // Lido da instância do item
  MOUNTHP: 80, // Lido da instância do item
  MOUNTSANC: 81, // TOOLTIP_VALUE — lido da instância do item
  MOUNTFEED: 82, // Lido da instância do item
  MOUNTKILL: 83, // Lido da instância do item
  INCUDELAY: 84, // NO_SCALE_1 (excluído de scaling)
  SUBGUILD: 85,
  PREVBONUS: 86, // MASTERY_BONUS (bônus pontos de mastery)
  ITEMTYPE: 87, // WEAPON_MASTERY_TYPE (tipo mastery 1-5), bypass scaling
  TERRITORY: 88, // NO_SCALE_4 (excluído de scaling)
  ABSDAM: 89,
  ABSAC: 90,
  HP_REGEN_BONUS: 91,
  UNK_93: 93, // Unknown flag (always 1)
  GRADE0: 100,
  GRADE1: 101,
  GRADE2: 102,
  GRADE3: 103,
  GRADE4: 104,
  GRADE5: 105,
  CONTMES: 106,
  CONTHOR: 107,
  CONTMIN: 108,
  CONTANO: 109,
  CONTDIA: 110,
  NOTRADE: 111, // RAW_RETURN (retorna valor SEM scaling)
  REQ_EVO: 112, // CELESTIAL_FLAG (1=male, 2=female, 3=evolved), bypass scaling — evo tier check
  UNIQUE_FLAG: 113, // ITEM_SUBCATEGORY, bypass scaling
  SANC2: 115,
  DYE_BLUE: 116,
  DYE_RED: 117,
  DYE_GREEN: 118,
  DYE_SILVER: 119,
  DYE_BLACK: 120,
  DYE_PURPLE: 121,
  DYE_BROWN: 122,
  DYE_DARKRED: 123,
  DYE_YELLOW: 124,
  DYE_DARKBLUE: 125,
  SANC3: 126,
} as const;

/**
 * For destroying items use opcode `0x02E4` instead — the 0x376 kind=3 ("trash")
 * branch is vestigial.
 */
export const ITEM_CONTAINER = { EQUIP: 0, BAG: 1, STORAGE: 2 } as const;
export type ItemContainerKind = (typeof ITEM_CONTAINER)[keyof typeof ITEM_CONTAINER];

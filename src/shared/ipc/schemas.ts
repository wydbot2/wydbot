import { z } from 'zod';

import { ITEM_CONTAINER } from '../constants/item-definitions';
import { ProxySettingsSchema } from '../proxy-config';

// World grid is 4096×4096 (see ).
const TileCoord = z.number().int().min(0).max(4095);

const PositionSchema = z.object({
  x: TileCoord,
  y: TileCoord,
});

// Strips C0/C1 control chars (except tab/newline/cr) — defends log/wire infra
// against injection by a compromised renderer.
const PrintableString = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''));

// Numpad direction codes 0x31..0x39 except 0x35 (center = no movement).
// Must match DirectionCode in ./walkability (DIR_DELTA has no 0x35 entry).
// Used by walkability-aware MOVE.
const DirectionCodeSchema = z.union([
  z.literal(0x31),
  z.literal(0x32),
  z.literal(0x33),
  z.literal(0x34),
  z.literal(0x36),
  z.literal(0x37),
  z.literal(0x38),
  z.literal(0x39),
]);

// Party (grupo): both payloads carry a server charIndex (u16).
export const PartyInvitePayloadSchema = z.object({
  targetIndex: z.number().int().min(0).max(0xffff),
});

export const PartyAcceptPayloadSchema = z.object({
  inviterIndex: z.number().int().min(0).max(0xffff),
  inviterName: PrintableString(16),
});

// ---------------------------------------------------------------------------
// Connection / pre-game
// ---------------------------------------------------------------------------

export const ConnectPayloadSchema = z.object({
  server: z
    .object({
      ip: z
        .string()
        .max(45) // IPv6 max
        .regex(/^[0-9a-fA-F.:]+$/, 'invalid ip characters'),
      port: z.number().int().min(1).max(65535),
      name: z.string().max(64).optional(),
      channel: z.number().int().min(0).max(255).optional(),
    })
    .passthrough(), // ServerChannel may carry display fields we don't validate
  proxy: ProxySettingsSchema.optional().default({ enabled: false }),
});

export const HardwareIdentitySeedSchema = z.uuid();

export const LoginPayloadSchema = z.object({
  username: PrintableString(15),
  password: PrintableString(15),
  hardwareIdentitySeed: HardwareIdentitySeedSchema.nullable().optional(),
});

export const TokenPayloadSchema = z.object({
  password: z.string().regex(/^\d{4,6}$/, 'numeric password must contain 4 to 6 digits'),
  isChanging: z.number().int().min(0).max(1),
});

export const CharSelectPayloadSchema = z.object({
  charIndex: z.number().int().min(0).max(3),
});

// ---------------------------------------------------------------------------
// In-game actions
// ---------------------------------------------------------------------------

export const MovePayloadSchema = z.object({
  moveId: z.number().int().min(0),
  destiny: PositionSchema,
  moveType: z.number().int().min(0).max(15),
  speedMove: z.number().int().min(0).max(1000),
  // Set → route-driven; absent → straight-line (manual click).
  source: PrintableString(32).optional(),
  exact: z.boolean().optional(),
});

export const MoveSetRoutePayloadSchema = z.object({
  source: PrintableString(32),
  tiles: z.array(PositionSchema).max(64),
  codes: z.array(DirectionCodeSchema).max(63),
  waypoints: z.array(z.number().int().min(0).max(63)).max(64).optional(),
});

export const AttackPayloadSchema = z.object({
  targetIndex: z.number().int().min(0).max(0xffff),
  targetPosition: PositionSchema,
  skillId: z.number().int().min(0).max(0xffff),
  /** SkillData.packetKind (1→0x39D, 2→0x39E, other→0x367). Default 1. */
  packetKind: z.number().int().min(0).max(255).optional(),
  /** Secondary multi-target mob indexes (not including primary). */
  extraTargetIndexes: z.array(z.number().int().min(0).max(0xffff)).max(12).optional(),
});

// packetKind: 1 → 0x39D self, 0 → 0x367 generic (SkillData.bin dispatch).
export const CastBuffPayloadSchema = z.object({
  skillId: z.number().int().min(0).max(0xffff),
  packetKind: z.union([z.literal(0), z.literal(1)]),
});

export const NpcClickPayloadSchema = z.object({
  targetMobIndex: z.number().int().min(0).max(0xffff),
});

// Literal union so the parsed payload is assignable to ItemContainerKind.
const ItemContainerKindSchema = z.union([
  z.literal(ITEM_CONTAINER.EQUIP),
  z.literal(ITEM_CONTAINER.BAG),
  z.literal(ITEM_CONTAINER.STORAGE),
]);

export const ItemMovePayloadSchema = z.object({
  srcKind: ItemContainerKindSchema, // 0=equip, 1=bag, 2=storage
  srcSlot: z.number().int().min(0).max(127),
  dstKind: ItemContainerKindSchema,
  dstSlot: z.number().int().min(0).max(127),
  bankerId: z.number().int().min(0).max(0xffff).optional(), // banker mobIndex @0x376+0x10; 0/absent for a bag drag
});

export const ItemDestroyPayloadSchema = z.object({
  slot: z.number().int().min(0).max(63),
  itemId: z.number().int().min(0).max(0x1963),
});

// 0x373 Form A USE. `feedMarker` is the canonical +0x18 byte:
// 0 = potion/herb (category 1 or 0xF2/0xF3); 0xE = mount feed (category 0xF).
// `itemId` is carried for diagnostic/logging only — the wire does NOT include
// itemId (server reads server-side inventory[slot]). Renderer validates
// inventory[slot].index === itemId BEFORE sending (game-api.ts).
export const UseItemPayloadSchema = z.object({
  slot: z.number().int().min(0).max(59),
  itemId: z.number().int().min(1).max(0x1963),
  feedMarker: z.union([z.literal(0), z.literal(0xe)]),
});

// Hunt-scroll teleport (0x3AE arm → ~5s → 0x373). itemId is constrained to the
// 6 Pedido de Caça ids; main re-validates and snaps (destX,destY) to a PotalPos
// destination, sending only the resolved 1-based menu index.
export const UseTeleportScrollPayloadSchema = z.object({
  scrollId: z.number().int().min(0),
  slot: z.number().int().min(0).max(59),
  itemId: z.number().int().min(0xd68).max(0xd6d),
  destX: z.number().int().min(0).max(0xffff),
  destY: z.number().int().min(0).max(0xffff),
});

// Channel scroll (Pergaminho Retorno / Teleporte / Portal): 0x3AE arm → ~5s →
// 0x373 (+0x20=0). No destination — the server owns the fixed return/portal
// point. main re-validates the id against CHANNEL_SCROLL_IDS (item-use-kind.ts);
// the async DONE echo reuses TELEPORT_SCROLL_DONE.
export const UseReturnScrollPayloadSchema = z.object({
  scrollId: z.number().int().min(0),
  slot: z.number().int().min(0).max(59),
  itemId: z.number().int().min(0).max(0xffff),
});

// Bank gold deposit/withdraw (0x388/0x387). 16-byte frame, amount u32 @+0x0C.
export const BankGoldPayloadSchema = z.object({
  amount: z.number().int().min(1).max(0xffffffff),
});

// Composition submit (0x2e7). Recipe index + up to 8 gathered ingredients (item + bag slot).
// qty is always 0 on the wire — the server reads the actual stack from the source slot.
export const ComposeSubmitPayloadSchema = z.object({
  recipeIndex: z.number().int().min(0).max(0x7fffffff),
  ingredients: z
    .array(
      z.object({
        itemId: z.number().int().min(1).max(0x1963),
        qty: z.number().int().min(0).max(0),
        slot: z.number().int().min(0).max(63),
      }),
    )
    .max(8),
});

export const ShopBuyPayloadSchema = z.object({
  npcIndex: z.number().int().min(0).max(0xffff),
  slotIndex: z.number().int().min(0).max(26),
  bagSlot: z.number().int().min(0).max(59),
});

export const MiniPopupClickPayloadSchema = z.object({
  buttonIndex: z.number().int().min(0).max(15),
});

export const ChatPayloadSchema = z.object({
  message: PrintableString(96),
});

export const WhisperPayloadSchema = z.object({
  // Wire field is 16 chars. Server treats this as recipient/command name.
  command: PrintableString(15),
  message: PrintableString(96),
});

// ---------------------------------------------------------------------------
// Logging / misc
// ---------------------------------------------------------------------------

export const IpcLogEntrySchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  message: PrintableString(1024),
  timestamp: z.string().max(48),
  category: z.string().max(64).optional(),
});

// ---------------------------------------------------------------------------
// App config
// ---------------------------------------------------------------------------

// Path-jail enforcement (resolve against per-machine data dir) is in the
// handler — this schema only shape-checks.
export const AppConfigOpenPayloadSchema = z
  .object({
    path: z.string().max(2048).optional(),
  })
  .optional();

export const AppConfigSavePayloadSchema = z.object({
  config: z.unknown(), // validated by AppConfigV1Schema downstream
  path: z.string().max(2048).nullable(),
});

export const RuntimeFaultPayloadSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// ---------------------------------------------------------------------------
// Inferred types (used in handlers + renderer for compile-time parity)
// ---------------------------------------------------------------------------

export type ConnectPayloadParsed = z.infer<typeof ConnectPayloadSchema>;
export type LoginPayloadParsed = z.infer<typeof LoginPayloadSchema>;
export type TokenPayloadParsed = z.infer<typeof TokenPayloadSchema>;
export type CharSelectPayloadParsed = z.infer<typeof CharSelectPayloadSchema>;
export type MovePayloadParsed = z.infer<typeof MovePayloadSchema>;
export type MoveSetRoutePayloadParsed = z.infer<typeof MoveSetRoutePayloadSchema>;
export type AttackPayloadParsed = z.infer<typeof AttackPayloadSchema>;
export type CastBuffPayloadParsed = z.infer<typeof CastBuffPayloadSchema>;
export type NpcClickPayloadParsed = z.infer<typeof NpcClickPayloadSchema>;
export type ItemMovePayloadParsed = z.infer<typeof ItemMovePayloadSchema>;
export type ItemDestroyPayloadParsed = z.infer<typeof ItemDestroyPayloadSchema>;
export type UseItemPayloadParsed = z.infer<typeof UseItemPayloadSchema>;
export type BankGoldPayloadParsed = z.infer<typeof BankGoldPayloadSchema>;
export type ComposeSubmitPayloadParsed = z.infer<typeof ComposeSubmitPayloadSchema>;
export type ShopBuyPayloadParsed = z.infer<typeof ShopBuyPayloadSchema>;
export type MiniPopupClickPayloadParsed = z.infer<typeof MiniPopupClickPayloadSchema>;
export type ChatPayloadParsed = z.infer<typeof ChatPayloadSchema>;
export type WhisperPayloadParsed = z.infer<typeof WhisperPayloadSchema>;
export type IpcLogEntryParsed = z.infer<typeof IpcLogEntrySchema>;

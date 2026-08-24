export { AppConfigV1Schema, type AppConfigV1 } from './v1/config';

export {
  MiscSectionSchema,
  DeathReturnSchema,
  AutoStackSchema,
  AutoBuffSchema,
  MISC_AUTO_BUFF_MAX,
  MISC_AUTO_BUFF_RECAST_FLOOR_SEC,
  AutoSummonSchema,
  MISC_AUTO_SUMMON_RECAST_SEC,
  AutoDropSchema,
  MISC_AUTO_DROP_MAX_RULES,
  MISC_AUTO_DROP_MAX_ATTRS_PER_GROUP,
  MISC_AUTO_DROP_MAX_GROUPS_PER_SIDE,
  AutoGroupSchema,
  AutoGroupMemberSchema,
  MISC_AUTO_GROUP_MAX_MEMBERS,
  type MiscSection,
  type DeathReturnConfig,
  type DeathReturnMode,
  type AutoStackConfig,
  type AutoBuffConfig,
  type AutoSummonConfig,
  type AutoDropConfig,
  type AutoDropRule,
  type AutoDropAttr,
  type AutoDropAttrOp,
  type AutoGroupConfig,
  type AutoGroupMode,
  type AutoGroupMember,
} from './v1/sections/misc';

export { stripLegacyMiscReconnect } from './v1/strip-legacy-misc-reconnect';
export { migrateLegacyAutoDropGroups } from './v1/migrate-legacy-auto-drop';

export {
  AttackSectionSchema,
  AttackModeSchema,
  AttackTargetingSchema,
  RotationSchema,
  RotationSlotSchema,
  MonsterTargetSchema,
  GiveUpSchema,
  type AttackSection,
  type AttackMode,
  type AttackTargeting,
  type Rotation,
  type RotationSlot,
  type MonsterTarget,
  type GiveUp,
} from './v1/sections/attack';

export {
  MacroStepSchema,
  WalkStepSchema,
  InteractStepSchema,
  FollowStepSchema,
  ScriptStepSchema,
  DelayStepSchema,
  MarkerStepSchema,
  PortalStepSchema,
  type MacroStepConfig,
} from './v1/steps';

export {
  UlidSchema,
  MPositionSchema,
  WalkModeSchema,
  BankRuleSchema,
  ComposeIngredientSchema,
  ComposeActionSchema,
  ShopRuleSchema,
  ShopOpenSchema,
  InteractTargetSchema,
  FollowTargetSchema,
  ScriptLanguageSchema,
  MarkerNameSchema,
  ScriptNameSchema,
  type BankRule,
  type ComposeIngredient,
  type ComposeAction,
  type ShopRule,
  type ShopOpen,
  type InteractTarget,
  type FollowTarget,
} from './v1/primitives';

export {
  VALIDATION_MSG,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  MARKER_NAME_MAX,
  MARKER_NAME_REGEX,
  MAX_ITEM_ID,
  BANK_RULE_MAX,
  COMPOSE_ACTION_MAX,
  SHOP_RULE_MAX,
} from './v1/messages';

export { normalizeMarkerName, hasNamedStepConflict } from './v1/marker-helpers';

export { hasMonsterConflict } from './v1/attack-helpers';

export { hasGroupMemberConflict } from './v1/misc-helpers';

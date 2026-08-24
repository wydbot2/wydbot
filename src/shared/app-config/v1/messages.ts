/**
 * Single source of truth for validation tuning + pt-BR messages.
 *
 * Numeric/regex constants live here so the schema files (primitives, steps,
 * config) can import both bounds AND messages from one place — avoiding the
 * circular import that would happen if the constants stayed in primitives/
 * steps while those files also imported VALIDATION_MSG for `error:` args.
 */

/* ── Tuning constants ────────────────────────────────────────────────── */

export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 15 * 60 * 1000;

export const MARKER_NAME_MAX = 64;
export const MARKER_NAME_REGEX = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/** Item-id ceiling (shared with auto-healing's refId bound). */
export const MAX_ITEM_ID = 0x1963;
/** Max deposit/withdraw rules per bank step. */
export const BANK_RULE_MAX = 50;
/** Max recipes per compose step. */
export const COMPOSE_ACTION_MAX = 16;
/** Max buy rules per shop step. */
export const SHOP_RULE_MAX = 16;

/* ── pt-BR validation messages ───────────────────────────────────────── */

export const VALIDATION_MSG = {
  // Schema constraints
  ulidFormat: 'ID inválido — esperado ULID (26 caracteres Crockford base32)',
  positionOutOfBounds: 'Posição fora dos limites do mapa (0–4095)',
  positionNaN: 'X e Y precisam ser números válidos',
  walkModeInvalid: 'Modo de caminhada inválido',
  npcNameLength: 'Nome do NPC: 1 a 64 caracteres',
  portalUnknownPad: 'Posição não corresponde a um portal de zona conhecido',
  scriptSourceLength: 'Script: 1 a 8192 caracteres',
  scriptNameLength: `Nome do script: 1 a ${MARKER_NAME_MAX} caracteres`,
  scriptNameRegex: 'Nome inválido — use A-Z, 0-9, separados por _',
  markerLength: `Nome do marcador: 1 a ${MARKER_NAME_MAX} caracteres`,
  markerRegex: 'Nome inválido — use A-Z, 0-9, separados por _',
  delayRange: `Tempo: ${MIN_DELAY_MS / 1000}–${MAX_DELAY_MS / 1000} segundos`,

  // Cross-step invariants
  duplicateStepId: 'IDs de passo duplicados',
  duplicateNamedStep: 'Esse nome já está em uso por outro passo — escolha outro',
  stepsAtLeastTwo: 'Macro precisa de ao menos 2 passos',

  // Attack section invariants
  duplicateMonster: 'Esse monstro já está na lista',
  attackWhitelistRequired: 'Adicione ao menos 1 monstro à lista para habilitar o ataque',

  // Misc section invariants
  duplicateAutoDropItem: 'Esse item já tem uma regra — use apenas uma por item',
  duplicateGroupMember: 'Esse jogador já está na whitelist',

  // Bank step invariants
  bankRuleItemRequiresId: 'Regra de item do banco requer um item selecionado',
  bankRuleGoldRequiresAmount: 'Regra de ouro do banco requer uma quantia (mínimo 1)',
  bankRulesMax: `Máximo de ${BANK_RULE_MAX} regras por passo de banco`,
  bankRulesRequired: 'Adicione ao menos uma regra ao passo de banco',
  composeActionsMax: `Máximo de ${COMPOSE_ACTION_MAX} receitas por passo de composição`,
  composeActionsRequired: 'Adicione ao menos uma receita ao passo de composição',
  shopRulesMax: `Máximo de ${SHOP_RULE_MAX} itens por passo de loja`,
  interactSingleService: 'Um passo de interact só pode ter um serviço (banco, loja ou composição)',

  // Walk reasons mapped from validateWalk
  walkTooFar: 'Muito distante — adicione passos intermediários',
  walkBlocked: 'Destino bloqueado (parede ou obstáculo)',
  walkTeleportSuspected: (dist: number) =>
    `Distância grande (${dist} tiles) — provável teleporte. Step adicionado, mas a rota não conecta os pontos.`,

  // Form pre-parse failures
  delayInvalidNumber: 'Tempo: número inválido',

  // Engine state
  mapLoading: 'Mapa de tiles ainda carregando — aguarde um instante',

  // Main-process file I/O (app-config-handler)
  configPathOutsideDir: (dir: string) => `As macros só podem ser abertas e salvas na pasta ${dir}.`,
  configPathNotJson: 'O arquivo de macro precisa terminar em .json.',
} as const;

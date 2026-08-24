import type { z } from 'zod';
import { CATEGORY_LABELS, SUBTYPE_LABELS } from '../stores/macro-labels';
import type { MacroStepKind } from '../stores/macro-types';

/** One validation problem rendered for the user — never a Zod path/code. */
export interface ConfigIssue {
  /** Human location, e.g. "Passo 3 · Andar — posição" or "Nome da macro". */
  local: string;
  /** pt-BR message (already on issue.message via VALIDATION_MSG + the pt locale). */
  mensagem: string;
}

/** Per-kind chip label, derived from the macro label maps so wording lives in one place. */
const KIND_LABELS: Record<MacroStepKind, string> = {
  walk: CATEGORY_LABELS.walk,
  // interact/follow use their subtype (action) label, not the "NPC" bucket label.
  interact: SUBTYPE_LABELS['npc-interact'],
  follow: SUBTYPE_LABELS['npc-follow'],
  script: SUBTYPE_LABELS.script,
  delay: SUBTYPE_LABELS.delay,
  marker: SUBTYPE_LABELS.marker,
  portal: SUBTYPE_LABELS['portal-teleport'],
};

/** Path-tail field name → pt-BR. `stepFieldTail` returns the first segment under
 *  the step (e.g. "position"/"target"), so deeper leaves (x/y/npcName) never reach here. */
const FIELD_LABELS: Record<string, string> = {
  position: 'posição',
  mode: 'modo',
  name: 'nome',
  source: 'script',
  language: 'linguagem',
  ms: 'tempo',
  target: 'alvo',
  monsters: 'monstros',
  skillId: 'skill',
  detectionRadius: 'raio de detecção',
  attackRange: 'alcance',
  timeoutSec: 'tempo limite',
  itemId: 'item',
  thresholdPct: 'limite %',
  recastIntervalSec: 'intervalo',
  username: 'usuário',
  charIndex: 'personagem',
  channel: 'canal',
};

/** Top-level section (path[0]) → pt-BR. */
const SECTION_LABELS: Record<string, string> = {
  name: 'Nome da macro',
  version: 'Versão do arquivo',
  steps: 'Passos',
  attack: 'Ataque',
  misc: 'Misc',
  createdAt: 'Datas',
  updatedAt: 'Datas',
};

const stepKindOf = (source: unknown, index: number): MacroStepKind | undefined => {
  const steps = (source as { steps?: unknown[] } | null | undefined)?.steps;
  const step = Array.isArray(steps) ? steps[index] : undefined;
  const kind = (step as { kind?: unknown } | undefined)?.kind;
  return typeof kind === 'string' && kind in KIND_LABELS ? (kind as MacroStepKind) : undefined;
};

/** First string segment after the step index — the failing field name. */
const stepFieldTail = (path: PropertyKey[]): string | undefined => {
  for (let i = 2; i < path.length; i++) {
    if (typeof path[i] === 'string') return path[i] as string;
  }
  return undefined;
};

const localForStep = (path: PropertyKey[], source: unknown): string => {
  // ['steps'] container issue (min-2, duplicate id) — macro-level, never "Passo 1".
  if (path.length < 2 || typeof path[1] !== 'number') return SECTION_LABELS.steps;
  const index = path[1];
  const kind = stepKindOf(source, index);
  const kindLabel = kind ? KIND_LABELS[kind] : undefined;
  const field = stepFieldTail(path);
  const fieldLabel = field ? FIELD_LABELS[field] : undefined;
  return (
    `Passo ${index + 1}` +
    (kindLabel ? ` · ${kindLabel}` : '') +
    (fieldLabel ? ` — ${fieldLabel}` : '')
  );
};

const localForIssue = (path: PropertyKey[], source: unknown): string => {
  if (path.length === 0) return 'Macro';
  if (path[0] === 'steps') return localForStep(path, source);
  const section = typeof path[0] === 'string' ? SECTION_LABELS[path[0]] : undefined;
  if (!section) return 'Geral';
  const tail = path[path.length - 1];
  const fieldLabel = typeof tail === 'string' && tail !== path[0] ? FIELD_LABELS[tail] : undefined;
  return fieldLabel ? `${section} — ${fieldLabel}` : section;
};

/**
 * Maps each Zod issue to a user-facing { local, mensagem }. Messages are already
 * pt-BR (VALIDATION_MSG overrides + the global pt locale fill defaults), so
 * `mensagem` is `issue.message` verbatim. `source` is the object that was
 * validated — used to resolve a step's kind for the chip (the Zod path carries
 * only the index).
 */
export const formatConfigIssues = (error: z.ZodError, source: unknown): ConfigIssue[] =>
  error.issues.map((issue) => ({
    local: localForIssue(issue.path, source),
    mensagem: issue.message,
  }));

/** Short locator for the toast sub-line ("Passo 3" out of "Passo 3 · Andar — posição"). */
const shortLocal = (local: string): string => local.split(' · ')[0].split(' — ')[0];

const PT_CONJUNCTION = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** Toast sub-line: the single message for 1 issue, else the first locations (…+N). */
export const configErrorDetail = (issues: ConfigIssue[]): string => {
  if (issues.length === 1) return `${issues[0].local} — ${issues[0].mensagem}`;
  const shorts = issues.map((i) => shortLocal(i.local));
  if (issues.length <= 3) return `${PT_CONJUNCTION.format(shorts)}.`;
  return `${shorts.slice(0, 3).join(', ')} …+${issues.length - 3}`;
};

/** Toast headline: count-aware on save, file-name on load. */
export const toastErrorTitle = (count: number, context: 'save' | 'load', name?: string): string => {
  if (context === 'load') return `Não foi possível abrir '${name ?? 'arquivo'}'`;
  return count === 1
    ? '1 problema impediu o salvamento'
    : `${count} problemas impediram o salvamento`;
};

/** Dialog headline: "N problema(s) na macro" (save) / "no arquivo" (load). */
export const dialogErrorTitle = (count: number, context: 'save' | 'load'): string => {
  const where = context === 'load' ? 'no arquivo' : 'na macro';
  return count === 1 ? `1 problema ${where}` : `${count} problemas ${where}`;
};

/** Dialog lead sentence, by context. */
export const dialogLead = (context: 'save' | 'load'): string =>
  context === 'load'
    ? 'O arquivo não passou na validação. Pode ter sido editado manualmente ou salvo por outra versão.'
    : 'Corrija os itens abaixo e salve novamente.';

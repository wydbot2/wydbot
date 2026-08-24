import { describe, expect, it } from 'vitest';
import { AppConfigV1Schema, VALIDATION_MSG } from '@shared/app-config';
import {
  configErrorDetail,
  dialogErrorTitle,
  formatConfigIssues,
  toastErrorTitle,
  type ConfigIssue,
} from '@renderer/lib/config-issue-format';

const ULID_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ULID_B = '01BX5ZZKBKACTAV9WEVGEMMVRZ';

/** Validate `value`, asserting it fails, and format the resulting issues. */
const issuesOf = (value: unknown): ConfigIssue[] => {
  const r = AppConfigV1Schema.safeParse(value);
  if (r.success) throw new Error('expected the config to be invalid');
  return formatConfigIssues(r.error, value);
};

describe('formatConfigIssues — local labels', () => {
  it('labels a step leaf path as "Passo N · <kind> — <campo>" with index+1 and reuses the pt-BR message', () => {
    const issues = issuesOf({
      version: 1,
      name: 'x',
      steps: [
        { id: ULID_A, kind: 'walk', position: { x: 5120, y: 10 }, mode: 'exact' },
        { id: ULID_B, kind: 'delay', ms: 500 },
      ],
    });
    const locais = issues.map((i) => i.local);
    expect(locais).toContain('Passo 1 · Andar — posição');
    expect(locais).toContain('Passo 2 · Esperar — tempo');

    const mensagens = issues.map((i) => i.mensagem);
    expect(mensagens).toContain(VALIDATION_MSG.positionOutOfBounds);
    expect(mensagens).toContain(VALIDATION_MSG.delayRange);
  });

  it('maps a ["steps"] container issue to "Passos" (never "Passo 1")', () => {
    const issues = issuesOf({
      version: 1,
      name: 'x',
      steps: [{ id: ULID_A, kind: 'marker', name: 'M1' }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].local).toBe('Passos');
    expect(issues[0].mensagem).toBe(VALIDATION_MSG.stepsAtLeastTwo);
  });

  it('maps a top-level field path to its section label', () => {
    const issues = issuesOf({ version: 1, name: '' });
    expect(issues).toHaveLength(1);
    expect(issues[0].local).toBe('Nome da macro');
    expect(issues[0].mensagem.length).toBeGreaterThan(0);
  });

  it('omits the kind chip when the step kind cannot be resolved (malformed step)', () => {
    const issues = issuesOf({
      version: 1,
      name: 'x',
      steps: [
        { id: ULID_A, position: { x: 0, y: 0 } }, // missing `kind` → discriminated-union failure
        { id: ULID_B, kind: 'delay', ms: 2000 },
      ],
    });
    expect(issues.some((i) => i.local.startsWith('Passo 1'))).toBe(true);
    expect(issues.every((i) => !i.local.includes('·') || !i.local.startsWith('Passo 1 ·'))).toBe(
      true,
    );
  });
});

describe('configErrorTitle helpers', () => {
  it('toast title is count-aware on save and singular-correct', () => {
    expect(toastErrorTitle(1, 'save')).toBe('1 problema impediu o salvamento');
    expect(toastErrorTitle(3, 'save')).toBe('3 problemas impediram o salvamento');
  });

  it('toast title uses the file name on load', () => {
    expect(toastErrorTitle(2, 'load', 'henesys-grind')).toBe(
      "Não foi possível abrir 'henesys-grind'",
    );
  });

  it('dialog title varies "na macro" (save) vs "no arquivo" (load) and pluralizes', () => {
    expect(dialogErrorTitle(1, 'save')).toBe('1 problema na macro');
    expect(dialogErrorTitle(2, 'load')).toBe('2 problemas no arquivo');
  });
});

describe('configErrorDetail (toast sub-line)', () => {
  const mk = (local: string): ConfigIssue => ({ local, mensagem: 'm' });

  it('shows the single message for one issue', () => {
    expect(
      configErrorDetail([{ local: 'Passo 3 · Andar — posição', mensagem: 'fora dos limites' }]),
    ).toBe('Passo 3 · Andar — posição — fora dos limites');
  });

  it('joins up to three short locations with "e"', () => {
    expect(configErrorDetail([mk('Passo 3'), mk('Passo 6'), mk('Passo 8')])).toBe(
      'Passo 3, Passo 6 e Passo 8.',
    );
  });

  it('truncates to the first three with "…+N" beyond three', () => {
    expect(configErrorDetail([mk('Passo 1'), mk('Passo 2'), mk('Passo 3'), mk('Passo 4')])).toBe(
      'Passo 1, Passo 2, Passo 3 …+1',
    );
  });
});

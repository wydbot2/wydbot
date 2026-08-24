import { describe, expect, it } from 'vitest';
import { resolveGiveUpTimeoutSec } from '@renderer/lib/macro-attack-engagement';
import { DEFAULT_GIVEUP_TIMEOUT_SEC } from '@shared/constants/attack';
import type { AttackSection } from '@shared/app-config';

const attack = (over: Partial<AttackSection>): AttackSection => over as AttackSection;

describe('resolveGiveUpTimeoutSec — per-target give-up resolution', () => {
  it('per-monster override wins over the global rule', () => {
    const a = attack({
      giveUp: { timeoutSec: 30 },
      monsters: [{ name: 'Lobo', giveUpTimeoutSec: 90 }],
    });
    expect(resolveGiveUpTimeoutSec(a, 'Lobo')).toBe(90);
  });

  it('matches the monster name case-insensitively and with surrounding whitespace', () => {
    const a = attack({ monsters: [{ name: 'Lobo Mau', giveUpTimeoutSec: 45 }] });
    expect(resolveGiveUpTimeoutSec(a, '  lobo mau ')).toBe(45);
  });

  it('falls back to the global attack.giveUp when the monster has no override', () => {
    const a = attack({
      giveUp: { timeoutSec: 50 },
      monsters: [{ name: 'Lobo' }],
    });
    expect(resolveGiveUpTimeoutSec(a, 'Lobo')).toBe(50);
  });

  it('falls back to the global rule for a target outside the whitelist', () => {
    const a = attack({
      giveUp: { timeoutSec: 50 },
      monsters: [{ name: 'Lobo', giveUpTimeoutSec: 90 }],
    });
    expect(resolveGiveUpTimeoutSec(a, 'Rato')).toBe(50);
  });

  it('falls back to DEFAULT_GIVEUP_TIMEOUT_SEC when nothing is configured', () => {
    expect(resolveGiveUpTimeoutSec(undefined, 'Lobo')).toBe(DEFAULT_GIVEUP_TIMEOUT_SEC);
    expect(resolveGiveUpTimeoutSec(attack({}), 'Lobo')).toBe(DEFAULT_GIVEUP_TIMEOUT_SEC);
    expect(resolveGiveUpTimeoutSec(attack({ monsters: [] }), 'Lobo')).toBe(
      DEFAULT_GIVEUP_TIMEOUT_SEC,
    );
  });
});

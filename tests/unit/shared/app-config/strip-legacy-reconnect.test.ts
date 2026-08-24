import { describe, expect, it } from 'vitest';
import { AppConfigV1Schema, stripLegacyMiscReconnect } from '../../../../src/shared/app-config';

describe('stripLegacyMiscReconnect', () => {
  it('removes misc.reconnect and leaves other misc keys', () => {
    const input = {
      version: 1 as const,
      name: 'hunt',
      misc: {
        reconnect: {
          enabled: true,
          username: 'alice',
          charIndex: 1,
        },
        autoStack: { enabled: true },
      },
    };
    const stripped = stripLegacyMiscReconnect(input) as typeof input;
    expect(stripped.misc).toEqual({ autoStack: { enabled: true } });
    expect(AppConfigV1Schema.safeParse(stripped).success).toBe(true);
  });

  it('passes through configs without reconnect', () => {
    const input = { version: 1 as const, name: 'x', misc: { autoStack: { enabled: false } } };
    expect(stripLegacyMiscReconnect(input)).toEqual(input);
  });

  it('fails strict parse if reconnect is not stripped', () => {
    const dirty = {
      version: 1 as const,
      name: 'x',
      misc: { reconnect: { enabled: true } },
    };
    expect(AppConfigV1Schema.safeParse(dirty).success).toBe(false);
  });
});

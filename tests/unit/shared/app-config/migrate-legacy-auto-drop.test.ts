/** Legacy auto-drop rules (`attrs` + `keepAttrs`) migrate to the grouped model at load. */
import { describe, it, expect } from 'vitest';
import { migrateLegacyAutoDropGroups } from '../../../../src/shared/app-config';

describe('migrateLegacyAutoDropGroups', () => {
  it('migrates attrs → dropGroups[0] and keepAttrs → keepGroups[0]', () => {
    const legacy = {
      version: 1,
      misc: {
        autoDrop: {
          enabled: true,
          rules: [
            {
              itemId: 840,
              attrs: [{ index: 74, op: '<', value: 21 }],
              keepAttrs: [{ index: 74, op: '>=', value: 39 }],
            },
          ],
        },
      },
    };
    const out = migrateLegacyAutoDropGroups(legacy) as {
      misc: { autoDrop: { rules: Record<string, unknown>[] } };
    };
    expect(out.misc.autoDrop.rules[0]).toEqual({
      itemId: 840,
      dropGroups: [[{ index: 74, op: '<', value: 21 }]],
      keepGroups: [[{ index: 74, op: '>=', value: 39 }]],
    });
  });

  it('legacy empty attrs (match-all) becomes an empty dropGroups list', () => {
    const legacy = {
      misc: { autoDrop: { enabled: true, rules: [{ itemId: 415, attrs: [] }] } },
    };
    const out = migrateLegacyAutoDropGroups(legacy) as {
      misc: { autoDrop: { rules: Record<string, unknown>[] } };
    };
    expect(out.misc.autoDrop.rules[0]).toEqual({ itemId: 415, dropGroups: [] });
  });

  it('passes new-shape rules through untouched', () => {
    const modern = {
      misc: {
        autoDrop: {
          enabled: true,
          rules: [{ itemId: 840, dropGroups: [[{ index: 74, op: '<=', value: 21 }]] }],
        },
      },
    };
    expect(migrateLegacyAutoDropGroups(modern)).toEqual(modern);
  });

  it('ignores configs without autoDrop rules', () => {
    const json = { version: 1, misc: {} };
    expect(migrateLegacyAutoDropGroups(json)).toEqual(json);
    expect(migrateLegacyAutoDropGroups(null)).toBe(null);
  });
});

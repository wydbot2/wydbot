import { describe, expect, it } from 'vitest';
import { MacroStepSchema, PortalStepSchema } from '@shared/app-config';
import { portalCenter, ZONE_PORTALS } from '@shared/constants/zone-portals';

const VALID_ULID = '01HZXK8Q7YV3N5M6P9R2S4T6W8';

describe('PortalStepSchema', () => {
  it('accepts a catalog pad step (position only)', () => {
    const pad = ZONE_PORTALS[0];
    const center = portalCenter(pad);
    const step = {
      id: VALID_ULID,
      kind: 'portal' as const,
      position: center,
    };
    expect(PortalStepSchema.safeParse(step).success).toBe(true);
    expect(MacroStepSchema.safeParse(step).success).toBe(true);
  });

  it('rejects unknown extra fields', () => {
    const r = PortalStepSchema.safeParse({
      id: VALID_ULID,
      kind: 'portal',
      position: { x: 100, y: 100 },
      name: 'Portal',
    });
    expect(r.success).toBe(false);
  });

  it('rejects OOB position', () => {
    const r = PortalStepSchema.safeParse({
      id: VALID_ULID,
      kind: 'portal',
      position: { x: 9999, y: 0 },
    });
    expect(r.success).toBe(false);
  });
});

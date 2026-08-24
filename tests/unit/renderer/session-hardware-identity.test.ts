import { generateHardwareIdentitySeed } from '@renderer/lib/session-hardware-identity';

describe('generateHardwareIdentitySeed', () => {
  it('uses a random UUID as the session identity seed', () => {
    const uuid = 'b8b9e4f2-6f1a-4b2c-9b47-1c123456789a';
    expect(generateHardwareIdentitySeed(() => uuid)).toBe(uuid);
  });
});

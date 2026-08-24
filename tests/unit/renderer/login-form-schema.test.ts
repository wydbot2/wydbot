import { LoginFormSchema } from '@renderer/lib/login-form-schema';

const VALID_INPUT = {
  channel: { name: 'Global', ip: '127.0.0.1', port: 8281 },
  username: 'player',
  password: 'secret',
  token: '1234',
  useProxy: false as const,
  proxyListUrl: '',
  useRandomMac: false as const,
  identitySeed: '',
};

describe('LoginFormSchema', () => {
  it('normalizes the username and an enabled HTTPS proxy URL', () => {
    const parsed = LoginFormSchema.parse({
      ...VALID_INPUT,
      username: ' player ',
      useProxy: true,
      proxyListUrl: ' https://example.com/proxies.txt ',
    });

    expect(parsed.username).toBe('player');
    expect(parsed.proxyListUrl).toBe('https://example.com/proxies.txt');
  });

  it('requires channel, username and password', () => {
    const parsed = LoginFormSchema.safeParse({
      ...VALID_INPUT,
      channel: null,
      username: ' ',
      password: '',
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(parsed.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['channel'], message: 'Selecione um canal.' }),
        expect.objectContaining({ path: ['username'], message: 'Informe o nome de usuário.' }),
        expect.objectContaining({ path: ['password'], message: 'Informe a senha.' }),
      ]),
    );
  });

  it('requires a numeric password with 4 to 6 digits', () => {
    for (const token of ['1234', '12345', '123456']) {
      expect(LoginFormSchema.safeParse({ ...VALID_INPUT, token }).success).toBe(true);
    }

    for (const token of ['', '123', '1234567', '12ab']) {
      expect(LoginFormSchema.safeParse({ ...VALID_INPUT, token }).success).toBe(false);
    }
  });

  it('validates the proxy URL only when proxy usage is enabled', () => {
    expect(
      LoginFormSchema.safeParse({ ...VALID_INPUT, useProxy: false, proxyListUrl: 'not a URL' })
        .success,
    ).toBe(true);
    expect(
      LoginFormSchema.safeParse({ ...VALID_INPUT, useProxy: true, proxyListUrl: 'not a URL' })
        .success,
    ).toBe(false);
    expect(
      LoginFormSchema.safeParse({
        ...VALID_INPUT,
        useProxy: true,
        proxyListUrl: 'http://example.com/proxies.txt',
      }).success,
    ).toBe(false);
    expect(
      LoginFormSchema.safeParse({
        ...VALID_INPUT,
        useProxy: true,
        proxyListUrl: 'file:///tmp/proxies.txt',
      }).success,
    ).toBe(false);
  });

  it('requires a valid UUID only when random hardware identity is enabled', () => {
    expect(
      LoginFormSchema.safeParse({
        ...VALID_INPUT,
        useRandomMac: true,
        identitySeed: 'b8b9e4f2-6f1a-4b2c-9b47-1c123456789a',
      }).success,
    ).toBe(true);
    expect(
      LoginFormSchema.safeParse({
        ...VALID_INPUT,
        useRandomMac: true,
        identitySeed: 'invalid',
      }).success,
    ).toBe(false);
  });
});

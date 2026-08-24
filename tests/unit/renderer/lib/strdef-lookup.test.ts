import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WydBotAPI } from '@shared/ipc/ipc-api';

const makeCatalog = (): string[] => Array.from({ length: 2000 }, () => '');
const installStrdefLoader = (loadStrdef: WydBotAPI['loadStrdef']): void => {
  (window as unknown as { wydAPI: Pick<WydBotAPI, 'loadStrdef'> }).wydAPI = { loadStrdef };
};

describe('strdef server-message lookup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses the WYD.exe code + 1000 rule and exposes whether the entry exists', async () => {
    const catalog = makeCatalog();
    catalog[1471] = 'Senha incorreta.';
    installStrdefLoader(vi.fn().mockResolvedValue(catalog));

    const { initStrdefLookup, resolveServerMessage } = await import('@renderer/lib/strdef-lookup');
    await initStrdefLookup();

    expect(resolveServerMessage(471)).toEqual({
      code: 471,
      index: 1471,
      text: 'Senha incorreta.',
      found: true,
    });
  });

  it('falls back to the raw code for an empty or out-of-range entry', async () => {
    installStrdefLoader(vi.fn().mockResolvedValue(makeCatalog()));

    const { getServerMessage, initStrdefLookup, resolveServerMessage } =
      await import('@renderer/lib/strdef-lookup');
    await initStrdefLookup();

    expect(resolveServerMessage(471).found).toBe(false);
    expect(getServerMessage(471)).toBe('[#471]');
    expect(getServerMessage(1000)).toBe('[#1000]');
  });

  it('deduplicates concurrent catalog loads and recognizes only canonical popup subtypes', async () => {
    let release!: (catalog: string[]) => void;
    const load = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          release = resolve;
        }),
    );
    installStrdefLoader(load);

    const { initStrdefLookup, isServerPopupSubtype } = await import('@renderer/lib/strdef-lookup');
    const first = initStrdefLookup();
    const second = initStrdefLookup();
    release(makeCatalog());
    await Promise.all([first, second]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(isServerPopupSubtype(0)).toBe(true);
    expect(isServerPopupSubtype(4)).toBe(true);
    expect(isServerPopupSubtype(1)).toBe(false);
  });
});

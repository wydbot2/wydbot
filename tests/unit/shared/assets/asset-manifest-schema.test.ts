import { describe, expect, it } from 'vitest';
import { RaidInfoSchema, selectGameAssetSource } from '@shared/assets/asset-manifest-schema';

const sampleInfo = {
  version: '1.0.7',
  url: 'https://download.raidhut.com/Launcher_1_0_7.zip',
  games: {
    Global: {
      name: 'WYD Global',
      version: 712,
      executable: 'WYD.exe',
      maintenance: { next: '2026-05-28 11:00', tz: 'America/Fortaleza' }, // extra field, passthrough
      links: {
        download: 'https://download.raidhut.com/binaries/Global.zip',
        patches: 'http://download.raidhut.com/wyd/Global/',
        site: 'https://wydglobal.raidhut.com', // extra link, passthrough
      },
    },
  },
};

describe('RaidInfoSchema + selectGameAssetSource', () => {
  it('validates the real info.json shape (passthrough on extras)', () => {
    const info = RaidInfoSchema.parse(sampleInfo);
    expect(info.games.Global.version).toBe(712);
  });

  it('projects a game to an https-forced source with trailing-slash patch base', () => {
    const info = RaidInfoSchema.parse(sampleInfo);
    const src = selectGameAssetSource(info, 'Global');
    expect(src).toEqual({
      name: 'WYD Global',
      version: 712,
      baseZipUrl: 'https://download.raidhut.com/binaries/Global.zip',
      patchBaseUrl: 'https://download.raidhut.com/wyd/Global/', // http→https forced
    });
  });

  it('appends a trailing slash when the patch base lacks one', () => {
    const info = RaidInfoSchema.parse({
      games: {
        Global: {
          name: 'WYD Global',
          version: 1,
          links: { download: 'https://h/Global.zip', patches: 'https://h/wyd/Global' },
        },
      },
    });
    expect(selectGameAssetSource(info, 'Global').patchBaseUrl).toBe('https://h/wyd/Global/');
  });

  it('throws for an unknown game key', () => {
    const info = RaidInfoSchema.parse(sampleInfo);
    expect(() => selectGameAssetSource(info, 'Nope')).toThrow(/no game/);
  });

  it('rejects a malformed manifest (non-integer version, bad url)', () => {
    expect(() =>
      RaidInfoSchema.parse({
        games: {
          Global: {
            name: 'x',
            version: 1.5,
            links: { download: 'https://h/a', patches: 'https://h/b' },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      RaidInfoSchema.parse({
        games: {
          Global: {
            name: 'x',
            version: 1,
            links: { download: 'ftp://h/a', patches: 'https://h/b' },
          },
        },
      }),
    ).toThrow();
  });
});

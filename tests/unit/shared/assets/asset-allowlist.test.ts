import { describe, expect, it } from 'vitest';
import { matchAssetPath, REQUIRED_ASSET_DESTS } from '@shared/assets/asset-allowlist';

describe('matchAssetPath', () => {
  it('maps localized text from Lang/PT (not the Korean root/UI copies)', () => {
    expect(matchAssetPath('Lang/PT/strdef.bin')?.dest).toBe('strdef.bin');
    expect(matchAssetPath('Lang/PT/itemname.bin')?.dest).toBe('itemname.bin');
    expect(matchAssetPath('Lang/PT/itemhelp.dat')?.dest).toBe('itemhelp.dat');
    expect(matchAssetPath('Lang/PT/minimap.dat')?.dest).toBe('minimap.dat');
    // Korean originals are intentionally skipped.
    expect(matchAssetPath('UI/strdef.bin')).toBeNull();
    expect(matchAssetPath('strdef.bin')).toBeNull();
    expect(matchAssetPath('itemname.bin')).toBeNull();
    expect(matchAssetPath('minimap.dat')).toBeNull();
  });

  it('maps root data bins (written RAW) with our casing', () => {
    expect(matchAssetPath('ItemList.bin')?.dest).toBe('ItemList.bin');
    expect(matchAssetPath('extraitem.bin')?.dest).toBe('extraitem.bin');
    expect(matchAssetPath('SkillData.bin')?.dest).toBe('SkillData.bin');
    expect(matchAssetPath('MountData.bin')?.dest).toBe('MountData.bin');
    expect(matchAssetPath('MountDataV.bin')?.dest).toBe('MountDataV.bin');
    expect(matchAssetPath('itemicon.bin')?.dest).toBe('itemicon.bin');
    expect(matchAssetPath('object.bin')?.dest).toBe('object.bin');
    expect(matchAssetPath('serverlist.bin')?.dest).toBe('serverlist.bin');
    expect(matchAssetPath('Env/AttributeMap.dat')?.dest).toBe('AttributeMap.dat');
    expect(matchAssetPath('UI/NewAmulOn.wyt')?.dest).toBe('NewAmulOn.wyt');
  });

  it('maps all map sectors (wildcard, D2) into maps/, preserving basename', () => {
    expect(matchAssetPath('Env/Field0204.trn')?.dest).toBe('maps/Field0204.trn');
    expect(matchAssetPath('Env/Field1228.dat')?.dest).toBe('maps/Field1228.dat');
    expect(matchAssetPath('UI/m0724.wyt')?.dest).toBe('maps/m0724.wyt');
    expect(matchAssetPath('Env/Field0204.trn')?.required).toBe(false);
  });

  it('maps icon atlases (itemicon / itemiconNN) into Icons/', () => {
    expect(matchAssetPath('UI/itemicon.wyt')?.dest).toBe('Icons/itemicon.wyt');
    expect(matchAssetPath('UI/itemicon01.wyt')?.dest).toBe('Icons/itemicon01.wyt');
    expect(matchAssetPath('UI/itemicon91.wyt')?.dest).toBe('Icons/itemicon91.wyt');
    // Other UI atlases are NOT icon atlases — skipped.
    expect(matchAssetPath('UI/amulet.wyt')).toBeNull();
    expect(matchAssetPath('UI/Inven01.wyt')).toBeNull();
  });

  it('is case-insensitive and tolerates leading ./ and backslashes', () => {
    expect(matchAssetPath('env/attributemap.dat')?.dest).toBe('AttributeMap.dat');
    expect(matchAssetPath('./ItemList.bin')?.dest).toBe('ItemList.bin');
    expect(matchAssetPath('Env\\Field0204.trn')?.dest).toBe('maps/Field0204.trn');
  });

  it('skips everything else (autodrain)', () => {
    expect(matchAssetPath('mesh/foo.msh')).toBeNull();
    expect(matchAssetPath('sound/bgm01.wav')).toBeNull();
    expect(matchAssetPath('AWYD.EXE')).toBeNull();
    expect(matchAssetPath('Effect/eff001.eff')).toBeNull();
    expect(matchAssetPath('InitItem.bin')).toBeNull();
  });

  it('REQUIRED_ASSET_DESTS lists the data files, not maps', () => {
    expect(REQUIRED_ASSET_DESTS).toContain('ItemList.bin');
    expect(REQUIRED_ASSET_DESTS).toContain('strdef.bin');
    expect(REQUIRED_ASSET_DESTS).toContain('AttributeMap.dat');
    expect(REQUIRED_ASSET_DESTS.some((d) => d.startsWith('maps/'))).toBe(false);
  });
});

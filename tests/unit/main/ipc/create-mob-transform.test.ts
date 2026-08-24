/**
 * `transformCreateMobForIpc` now forwards the CreateMob 16-id visible-model
 * snapshot (`equipModelIds`) for monsters and NPCs, so the Script API can
 * expose `entidade.appearance`. Other players and the local player do not
 * carry it.
 */
import { describe, it, expect } from 'vitest';
import { transformCreateMobForIpc } from '@main/ipc/ipc-transformers';
import type { ParsedCreateMob } from '@main/protocol/packet-types';
import type { MScore } from '@shared/types';

const score = (): MScore => ({
  level: 1,
  defense: 0,
  damage: 0,
  merchant: 0,
  movementSpeed: 0,
  direction: 0,
  chaosRate: 0,
  maxHp: 100,
  maxMp: 0,
  currHp: 100,
  currMp: 0,
  str: 0,
  int: 0,
  dex: 0,
  con: 0,
  special: [0, 0, 0, 0],
});

// body=0x3c in slot 0; weapon id in slot 6; rest empty.
const ITEMS = [0x3c, 0, 0, 0, 0, 0, 0x123, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const parsed = (over: Partial<ParsedCreateMob> = {}): ParsedCreateMob => ({
  header: { size: 256, key: 0, checkSum: 0, opcode: 0x364, clientId: 0, timeStamp: 0 },
  position: { x: 10, y: 20 },
  index: 5000,
  name: 'Orc',
  actionType: 0x10, // not in the NPC equip0 override set
  mobClassNibble: 0x00, // nibble 0 → not an NPC by nibble
  composeRoot: 0,
  items: ITEMS,
  affects: [],
  guildIndex: 0,
  guildMemberType: 0,
  score: score(),
  type: 0,
  tab: '',
  ...over,
});

describe('transformCreateMobForIpc — equipModelIds (appearance source)', () => {
  it('forwards the 16-id snapshot for monsters', () => {
    const e = transformCreateMobForIpc(parsed(), null);
    expect(e?.category).toBe('monster');
    expect(e && 'equipModelIds' in e && e.equipModelIds).toEqual(ITEMS);
  });

  it('forwards the 16-id snapshot for NPCs', () => {
    const e = transformCreateMobForIpc(parsed({ mobClassNibble: 0x02, name: 'Banker' }), null);
    expect(e?.category).toBe('npc');
    expect(e && 'equipModelIds' in e && e.equipModelIds).toEqual(ITEMS);
  });

  it('does NOT carry equipModelIds for other players', () => {
    const e = transformCreateMobForIpc(parsed({ index: 500 }), null);
    expect(e?.category).toBe('player_other');
    expect(e && 'equipModelIds' in e).toBe(false);
  });

  it('returns null for the local player', () => {
    expect(transformCreateMobForIpc(parsed({ index: 777 }), 777)).toBeNull();
  });
});

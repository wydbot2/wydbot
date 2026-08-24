import { describe, it, expect } from 'vitest';
import { discriminate } from '@main/protocol/mob-discriminator';

const NPC_ALLOWLIST = [0x33, 0x36, 0x37, 0x38, 0x39, 0x43, 0x44] as const;

describe('discriminate', () => {
  describe('player_self', () => {
    it('returns player_self when index matches playerMobIndex', () => {
      expect(discriminate({ index: 42, mobClassNibble: 0, actionType: 0 }, 42)).toBe('player_self');
    });

    it('beats player_other check when index < 1000', () => {
      expect(discriminate({ index: 100, mobClassNibble: 0, actionType: 0 }, 100)).toBe(
        'player_self',
      );
    });

    it('beats npc check (nibble) when index would otherwise classify as npc', () => {
      expect(discriminate({ index: 5000, mobClassNibble: 5, actionType: 0 }, 5000)).toBe(
        'player_self',
      );
    });
  });

  describe('player_other', () => {
    it('returns player_other when index < 1000 and != playerMobIndex', () => {
      expect(discriminate({ index: 500, mobClassNibble: 0, actionType: 0 }, 100)).toBe(
        'player_other',
      );
    });

    it('returns player_other when playerMobIndex is null and index < 1000', () => {
      expect(discriminate({ index: 999, mobClassNibble: 0, actionType: 0 }, null)).toBe(
        'player_other',
      );
    });

    it('beats npc check (nibble) when index < 1000 — index range wins', () => {
      expect(discriminate({ index: 500, mobClassNibble: 1, actionType: 0 }, null)).toBe(
        'player_other',
      );
    });
  });

  describe('npc — by mobClassNibble', () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])(
      'returns npc when lower nibble of mobClassNibble = %i',
      (nibble) => {
        expect(discriminate({ index: 5000, mobClassNibble: nibble, actionType: 0 }, null)).toBe(
          'npc',
        );
      },
    );

    it('masks upper bits of mobClassNibble (only lower nibble matters)', () => {
      // 0xF1 & 0x0f = 1, which is in the [1..14] NPC range
      expect(discriminate({ index: 5000, mobClassNibble: 0xf1, actionType: 0 }, null)).toBe('npc');
    });

    it('rejects nibble = 0 (below npc range)', () => {
      expect(discriminate({ index: 5000, mobClassNibble: 0, actionType: 0 }, null)).toBe('monster');
    });

    it('rejects nibble = 0x0f (above npc range cap at 0x0e)', () => {
      expect(discriminate({ index: 5000, mobClassNibble: 0x0f, actionType: 0 }, null)).toBe(
        'monster',
      );
    });
  });

  describe('npc — by actionType allowlist', () => {
    it.each(NPC_ALLOWLIST)('returns npc when actionType = 0x%s (in allowlist)', (actionType) => {
      expect(discriminate({ index: 5000, mobClassNibble: 0, actionType }, null)).toBe('npc');
    });

    it('rejects actionType not in allowlist', () => {
      expect(discriminate({ index: 5000, mobClassNibble: 0, actionType: 0x10 }, null)).toBe(
        'monster',
      );
    });
  });

  describe('monster — fallback', () => {
    it('returns monster when index >= 1000, nibble = 0, actionType not in allowlist', () => {
      expect(discriminate({ index: 5000, mobClassNibble: 0, actionType: 0 }, null)).toBe('monster');
    });

    it('returns monster at the index boundary (1000 with no NPC signal)', () => {
      expect(discriminate({ index: 1000, mobClassNibble: 0, actionType: 0 }, null)).toBe('monster');
    });
  });
});

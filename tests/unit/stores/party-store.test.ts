import { describe, it, expect, beforeEach } from 'vitest';
import { usePartyStore } from '../../../src/renderer/stores/party-store';

const reset = (): void => usePartyStore.getState().clear();

describe('usePartyStore', () => {
  beforeEach(reset);

  it('upserts members keyed by charIndex (dedup, latest wins)', () => {
    const s = usePartyStore.getState();
    s.upsertMember({ charIndex: 254, name: 'eguaManeira', isLeader: true });
    s.upsertMember({ charIndex: 262, name: 'Re-No-Quibe', isLeader: false });
    s.upsertMember({ charIndex: 254, name: 'eguaManeira', isLeader: false }); // same idx
    const members = usePartyStore.getState().members;
    expect(members.size).toBe(2);
    expect(members.get(254)?.isLeader).toBe(false);
    expect(members.get(262)?.name).toBe('Re-No-Quibe');
  });

  it('adds and removes pending invites, deduped by inviterIndex', () => {
    const s = usePartyStore.getState();
    s.addInvite({ inviterIndex: 254, inviterName: 'eguaManeira', receivedAtMs: 1 });
    s.addInvite({ inviterIndex: 254, inviterName: 'eguaManeira', receivedAtMs: 2 }); // refresh
    expect(usePartyStore.getState().pendingInvites).toHaveLength(1);
    expect(usePartyStore.getState().pendingInvites[0].receivedAtMs).toBe(2);
    usePartyStore.getState().removeInvite(254);
    expect(usePartyStore.getState().pendingInvites).toHaveLength(0);
  });

  it('clear() wipes members and invites', () => {
    const s = usePartyStore.getState();
    s.upsertMember({ charIndex: 1, name: 'x', isLeader: false });
    s.addInvite({ inviterIndex: 2, inviterName: 'y', receivedAtMs: 0 });
    s.clear();
    expect(usePartyStore.getState().members.size).toBe(0);
    expect(usePartyStore.getState().pendingInvites).toHaveLength(0);
  });

  it('removeMember dissolves when ≤1 member would remain', () => {
    const s = usePartyStore.getState();
    s.upsertMember({ charIndex: 254, name: 'eguaManeira', isLeader: true });
    s.upsertMember({ charIndex: 262, name: 'Re-No-Quibe', isLeader: false });
    s.removeMember(262); // 2 → 1 → auto-dissolve
    expect(usePartyStore.getState().members.size).toBe(0);
  });

  it('removeMember(0) dissolves the whole party', () => {
    const s = usePartyStore.getState();
    s.upsertMember({ charIndex: 1, name: 'a', isLeader: true });
    s.upsertMember({ charIndex: 2, name: 'b', isLeader: false });
    s.upsertMember({ charIndex: 3, name: 'c', isLeader: false });
    s.removeMember(0);
    expect(usePartyStore.getState().members.size).toBe(0);
  });

  it('removeMember keeps a ≥2-member party, dropping only the leaver', () => {
    const s = usePartyStore.getState();
    s.upsertMember({ charIndex: 1, name: 'a', isLeader: true });
    s.upsertMember({ charIndex: 2, name: 'b', isLeader: false });
    s.upsertMember({ charIndex: 3, name: 'c', isLeader: false });
    s.removeMember(2); // 3 → 2 → stays
    expect(usePartyStore.getState().members.size).toBe(2);
    expect(usePartyStore.getState().members.has(2)).toBe(false);
  });
});

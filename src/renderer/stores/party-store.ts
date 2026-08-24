import { create } from 'zustand';

export interface PartyMember {
  /** Server charIndex (== `entity.index`). */
  charIndex: number;
  name: string;
  isLeader: boolean;
}

export interface PendingInvite {
  inviterIndex: number;
  inviterName: string;
  receivedAtMs: number;
}

interface PartyState {
  /** Current roster keyed by charIndex. Populated by the S2C `0x37d` handler. */
  members: Map<number, PartyMember>;
  /** Invites awaiting a decision — drained by the auto-group module. */
  pendingInvites: PendingInvite[];

  upsertMember: (member: PartyMember) => void;
  removeMember: (charIndex: number) => void;
  addInvite: (invite: PendingInvite) => void;
  removeInvite: (inviterIndex: number) => void;
  clear: () => void;
}

export const usePartyStore = create<PartyState>((set) => ({
  members: new Map(),
  pendingInvites: [],

  upsertMember: (member) =>
    set((state) => {
      const members = new Map(state.members);
      members.set(member.charIndex, member);
      return { members };
    }),

  removeMember: (charIndex) =>
    set((state) => {
      if (charIndex === 0) return { members: new Map() };
      const members = new Map(state.members);
      members.delete(charIndex);
      return { members: members.size <= 1 ? new Map() : members };
    }),

  addInvite: (invite) =>
    set((state) => {
      // Dedup by inviter — a re-sent invite refreshes the entry.
      const rest = state.pendingInvites.filter((i) => i.inviterIndex !== invite.inviterIndex);
      return { pendingInvites: [...rest, invite] };
    }),

  removeInvite: (inviterIndex) =>
    set((state) => ({
      pendingInvites: state.pendingInvites.filter((i) => i.inviterIndex !== inviterIndex),
    })),

  clear: () => set({ members: new Map(), pendingInvites: [] }),
}));

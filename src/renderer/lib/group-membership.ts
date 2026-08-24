import { useMemo } from 'react';
import { usePartyStore, type PartyMember } from '../stores/party-store';

const namesOf = (members: Map<number, PartyMember>): ReadonlySet<string> =>
  new Set([...members.values()].map((m) => m.name.toLowerCase()));

/** Lowercased names of the current party members (hook form). */
export const useGroupMemberNames = (): ReadonlySet<string> => {
  const members = usePartyStore((s) => s.members);
  return useMemo(() => namesOf(members), [members]);
};

/** Non-hook variant for ambient modules reading via `getState()`. */
export const getGroupMemberNames = (): ReadonlySet<string> =>
  namesOf(usePartyStore.getState().members);

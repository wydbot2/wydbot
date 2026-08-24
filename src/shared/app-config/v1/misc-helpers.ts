import type { AutoGroupMember } from './sections/misc';

// case-insensitive — engine matches OtherPlayer.name without case
export const hasGroupMemberConflict = (
  members: ReadonlyArray<AutoGroupMember>,
  name: string,
): boolean => {
  const target = name.toLowerCase();
  return members.some((m) => m.name.toLowerCase() === target);
};

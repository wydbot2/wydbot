export type GameMessageKind = 'npc_interact_out_of_range' | 'unknown';

const OUT_OF_RANGE_PATTERNS: readonly RegExp[] = [/distante/i, /longe demais/i];

export const classifyGameMessage = (message: string): GameMessageKind => {
  if (OUT_OF_RANGE_PATTERNS.some((re) => re.test(message))) return 'npc_interact_out_of_range';
  return 'unknown';
};

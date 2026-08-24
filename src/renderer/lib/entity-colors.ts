import type { EntityCategory } from '@shared/types';

export const ENTITY_COLORS: Record<
  Exclude<EntityCategory, 'player_other'>,
  { hex: string; tw: string }
> = {
  player_self: { hex: '#ef4444', tw: 'bg-red-500' },
  npc: { hex: '#f472b6', tw: 'bg-pink-400' },
  monster: { hex: '#a855f7', tw: 'bg-purple-500' },
} as const;

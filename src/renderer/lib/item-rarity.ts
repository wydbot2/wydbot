import type { ItemRarity } from '../components/game/personagem/character-tables';

// Provisional: backend rarity not fully mapped — mirrors the TODO in
// character-tables.ts. Maps Item.grade to the 4 rarity tiers.
export const gradeToRarity = (grade: number): ItemRarity => {
  if (grade >= 9) return 'legend';
  if (grade >= 6) return 'epic';
  if (grade >= 3) return 'rare';
  return 'common';
};

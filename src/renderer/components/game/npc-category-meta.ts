import {
  AcademicCapIcon,
  BeakerIcon,
  BuildingLibraryIcon,
  GlobeAltIcon,
  QueueListIcon,
  QuestionMarkCircleIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';
import type { NpcCategory } from '@shared/types';

interface NpcCategoryMeta {
  label: string;
  /** Pink-family hex — applied inline (arbitrary, no Tailwind safelist). */
  colorHex: string;
  Icon: ComponentType<{ className?: string }>;
}

/** Category → label/color/icon (display only). Service SoT: `interact-service` + probe. */
export const NPC_CATEGORY_META: Record<NpcCategory, NpcCategoryMeta> = {
  bank: { label: 'Banco', colorHex: '#fb7185', Icon: BuildingLibraryIcon },
  shop: { label: 'Loja', colorHex: '#f9a8d4', Icon: ShoppingBagIcon },
  learn: { label: 'Aprender Skill', colorHex: '#e879f9', Icon: AcademicCapIcon },
  menupopup: { label: 'Menu Popup', colorHex: '#ec4899', Icon: QueueListIcon },
  portal: { label: 'Portal', colorHex: '#f43f5e', Icon: GlobeAltIcon },
  compose: { label: 'Composição', colorHex: '#f472b6', Icon: BeakerIcon },
  unknown: { label: 'Desconhecido', colorHex: '#9ca3af', Icon: QuestionMarkCircleIcon },
};

import type { FC } from 'react';
import { CATEGORY_LABELS, type MacroStepCategory } from '../../stores/macro-labels';
import { CategoryDot } from './CategoryDot';

interface CategoryGroupHeaderProps {
  category: MacroStepCategory;
}

export const CategoryGroupHeader: FC<CategoryGroupHeaderProps> = ({ category }) => (
  <div className="flex items-center gap-2 px-3 pt-2 pb-1">
    <CategoryDot category={category} size="sm" />
    <span className="text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase">
      {CATEGORY_LABELS[category]}
    </span>
  </div>
);

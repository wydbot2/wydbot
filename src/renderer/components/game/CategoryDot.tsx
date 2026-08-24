import type { FC } from 'react';
import type { MacroStepCategory } from '../../stores/macro-labels';
import { CATEGORY_COLORS } from '../../stores/macro-labels';

type CategoryDotSize = 'sm' | 'md';

interface CategoryDotProps {
  category: MacroStepCategory;
  size?: CategoryDotSize;
  alignTop?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<CategoryDotSize, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
};

export const CategoryDot: FC<CategoryDotProps> = ({
  category,
  size = 'md',
  alignTop = false,
  className = '',
}) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 rounded-full ${SIZE_CLASSES[size]} ${CATEGORY_COLORS[category]} ${alignTop ? 'mt-1' : ''} ${className}`}
  />
);

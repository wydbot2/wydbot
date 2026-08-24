import { useEffect, useLayoutEffect, useMemo } from 'react';
import {
  useFloating,
  flip,
  shift,
  type Placement,
  type UseFloatingReturn,
  type VirtualElement,
} from '@floating-ui/react';

interface CursorMenuOptions {
  placement?: Placement;
  fallbackPlacements?: Placement[];
}

/**
 * Floating-UI plumbing for a menu anchored at a cursor point: a zero-size
 * virtual reference plus flip/shift to keep it on screen, and click-outside +
 * Escape dismissal.
 */
export const useCursorMenu = (
  position: { x: number; y: number },
  onClose: () => void,
  { placement = 'bottom-start', fallbackPlacements }: CursorMenuOptions = {},
): UseFloatingReturn => {
  const virtualReference = useMemo<VirtualElement>(
    () => ({
      getBoundingClientRect: () => ({
        x: position.x,
        y: position.y,
        top: position.y,
        left: position.x,
        right: position.x,
        bottom: position.y,
        width: 0,
        height: 0,
      }),
    }),
    [position.x, position.y],
  );

  const floating = useFloating({
    strategy: 'fixed',
    placement,
    middleware: [
      flip(fallbackPlacements ? { fallbackPlacements } : undefined),
      shift({ padding: 8 }),
    ],
  });

  const { refs } = floating;

  // Virtual elements can't go through `elements.reference` (typed Element-only in
  // @floating-ui/react 0.26, and the lib dev-warns against it) — setPositionReference
  // is the supported channel. Layout effect so the anchor is set before first paint.
  useLayoutEffect(() => {
    refs.setPositionReference(virtualReference);
  }, [refs, virtualReference]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const node = refs.floating.current;
      if (node && !node.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, refs]);

  return floating;
};

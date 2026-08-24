import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon } from '@heroicons/react/20/solid';
import { useCursorMenu } from '../useCursorMenu';

interface ItemContextMenuProps {
  position: { x: number; y: number };
  onDelete: () => void;
  onClose: () => void;
}

export const ItemContextMenu: FC<ItemContextMenuProps> = ({ position, onDelete, onClose }) => {
  const { refs, floatingStyles } = useCursorMenu(position, onClose, {
    placement: 'right-start',
    fallbackPlacements: ['left-start', 'bottom-start', 'top-start'],
  });

  return createPortal(
    <div
      ref={refs.setFloating}
      role="menu"
      aria-label="Ações do item"
      className="z-50 min-w-32 overflow-hidden rounded-md border border-gray-600 bg-gray-800/95 py-1 text-xs shadow-xl ring-1 ring-black/30 backdrop-blur"
      style={floatingStyles}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-300 hover:bg-gray-700/50"
      >
        <TrashIcon className="h-4 w-4" />
        <span className="text-[11px]">Deletar</span>
      </button>
    </div>,
    document.body,
  );
};

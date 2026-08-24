import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { FC, ReactNode } from 'react';

type ModalSize = 'sm' | 'md' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  xl: 'max-w-4xl',
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Omit for custom or sr-only headers — render your own DialogTitle in children. */
  title?: ReactNode;
  headerAction?: ReactNode;
  /** Use `mr-auto` on an item to push it to the left of the row. */
  footer?: ReactNode;
  size?: ModalSize;
  align?: 'center' | 'top';
  /** Render raw children with no body wrapper — for pickers that own their layout. */
  unpadded?: boolean;
  className?: string;
  /** Targets the body wrapper (vs `className`, which targets the panel). */
  bodyClassName?: string;
  children?: ReactNode;
}

export const Modal: FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  headerAction,
  footer,
  size = 'sm',
  align = 'center',
  unpadded = false,
  className = '',
  bodyClassName = 'px-5 py-4',
  children,
}) => (
  <Dialog open={isOpen} onClose={onClose} className="relative z-50">
    <DialogBackdrop
      transition
      className="fixed inset-0 bg-black/60 transition-opacity duration-200 data-[closed]:opacity-0"
    />
    <div
      className={`fixed inset-0 flex justify-center p-4 ${align === 'top' ? 'items-start' : 'items-center'}`}
    >
      <DialogPanel
        transition
        className={`flex w-full ${SIZE_CLASS[size]} flex-col rounded-lg bg-gray-800 shadow-xl transition duration-200 data-[closed]:scale-95 data-[closed]:opacity-0 ${className}`}
      >
        {(title != null || headerAction != null) && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-700 px-5 py-4">
            {title != null && (
              <DialogTitle className="text-lg font-semibold text-gray-100">{title}</DialogTitle>
            )}
            {headerAction}
          </div>
        )}
        {unpadded ? children : <div className={bodyClassName}>{children}</div>}
        {footer != null && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-700 px-5 py-4">
            {footer}
          </div>
        )}
      </DialogPanel>
    </div>
  </Dialog>
);

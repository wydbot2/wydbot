import { Menu, MenuButton, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import type { FC, ReactNode } from 'react';
import { Button, FOCUS_RING, variantStyles, type ButtonSize, type ButtonVariant } from './Button';

interface SplitButtonProps {
  label: ReactNode;
  onClick: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  caretAriaLabel: string;
  menuAriaLabel?: string;
  /** Extra classes on the dropdown panel (e.g. width). */
  menuClassName?: string;
  children?: ReactNode;
}

// Caret drops the left radius and horizontal padding (className can't
// reliably override Button's `rounded-md`/`px-4`).
const caretSizeStyles: Record<ButtonSize, string> = {
  sm: `rounded-r-md px-1.5 py-1 text-xs ${FOCUS_RING}`,
  md: `rounded-r-md px-2 py-2 text-sm ${FOCUS_RING}`,
  'icon-sm': `rounded-r p-1 text-sm ${FOCUS_RING}`,
  'icon-xs': `rounded-r p-0.5 text-sm ${FOCUS_RING}`,
};

// Light divider on filled variants, subtle gray on ghost (Fluent/GitHub convention).
const dividerStyles = (variant: ButtonVariant): string =>
  variant.startsWith('ghost') || variant === 'link' ? 'border-gray-700' : 'border-white/20';

/** Main action segment + caret that opens a dropdown, sharing Button's variant palette. */
export const SplitButton: FC<SplitButtonProps> = ({
  label,
  onClick,
  variant = 'secondary',
  size = 'md',
  icon,
  disabled = false,
  title,
  caretAriaLabel,
  menuAriaLabel,
  menuClassName = '',
  children,
}) => (
  <Menu as="div" className="inline-flex">
    <Button
      variant={variant}
      size={size}
      icon={icon}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="rounded-r-none"
    >
      {label}
    </Button>
    <MenuButton
      aria-label={caretAriaLabel}
      disabled={disabled}
      className={`inline-flex items-center justify-center border-l font-medium transition-colors focus:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[open]:bg-black/15 ${dividerStyles(variant)} ${caretSizeStyles[size]} ${variantStyles[variant]}`}
    >
      <ChevronDownIcon aria-hidden="true" className="h-4 w-4" />
    </MenuButton>
    <MenuItems
      anchor="bottom end"
      transition
      aria-label={menuAriaLabel}
      className={`z-50 mt-1 w-72 origin-top rounded-md border border-gray-700 bg-gray-800 p-1 text-xs shadow-lg ring-1 ring-black/30 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 ${menuClassName}`}
    >
      {children}
    </MenuItems>
  </Menu>
);

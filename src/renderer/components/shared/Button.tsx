import {
  Button as HeadlessButton,
  type ButtonProps as HeadlessButtonProps,
} from '@headlessui/react';
import { forwardRef, type ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ghost'
  | 'ghost-accent'
  | 'ghost-muted'
  | 'ghost-danger'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'icon-sm' | 'icon-xs';

interface ButtonProps extends HeadlessButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading glyph rendered before children. */
  icon?: ReactNode;
  /** Replaces the icon with an in-button spinner and disables the button. */
  busy?: boolean;
  /** Static content only — the render-prop form is not supported. */
  children?: ReactNode;
}

export const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-white data-[hover]:bg-accent-700 focus:ring-accent-500',
  secondary: 'bg-gray-700 text-gray-100 data-[hover]:bg-gray-600 focus:ring-gray-500',
  success: 'bg-green-600 text-white data-[hover]:bg-green-500 focus:ring-green-500',
  warning: 'bg-yellow-600 text-white data-[hover]:bg-yellow-500 focus:ring-yellow-500',
  danger: 'bg-red-600 text-white data-[hover]:bg-red-700 focus:ring-red-500',
  ghost: 'bg-transparent text-gray-300 data-[hover]:bg-gray-800 focus:ring-gray-800',
  'ghost-accent':
    'bg-transparent text-accent-300 data-[hover]:bg-accent-600/15 data-[hover]:text-accent-200 focus:ring-accent-500',
  'ghost-muted':
    'bg-transparent text-gray-500 data-[hover]:bg-gray-700 data-[hover]:text-gray-300 focus:ring-gray-700',
  'ghost-danger':
    'bg-transparent text-gray-500 data-[hover]:bg-red-500/20 data-[hover]:text-red-400 focus:ring-red-500',
  link: 'bg-transparent text-accent-400 data-[hover]:text-accent-300',
};

export const FOCUS_RING = 'focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900';

const sizeStyles: Record<ButtonSize, string> = {
  sm: `rounded-md px-2 py-1 text-xs gap-1.5 ${FOCUS_RING}`,
  md: `rounded-md px-4 py-2 text-sm gap-1.5 ${FOCUS_RING}`,
  'icon-sm': `rounded p-1 text-sm ${FOCUS_RING}`,
  'icon-xs': `rounded p-0.5 text-sm ${FOCUS_RING}`,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      icon,
      busy = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const isLink = variant === 'link';
    const leading = busy ? <Spinner size={15} /> : icon;
    const sharedClassName = `inline-flex items-center justify-center font-medium transition-colors focus:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 ${!isLink ? sizeStyles[size] : 'text-sm'} ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${className} `;
    return (
      <HeadlessButton ref={ref} disabled={disabled || busy} className={sharedClassName} {...props}>
        {leading}
        {children}
      </HeadlessButton>
    );
  },
);

Button.displayName = 'Button';

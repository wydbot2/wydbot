import { Input, type InputProps } from '@headlessui/react';
import { type FC } from 'react';

interface TextInputProps extends InputProps {
  /** Padding reduzido (px-2 py-1.5) para layouts compactos, como linhas de tabela. */
  compact?: boolean;
}

export const TextInput: FC<TextInputProps> = ({ compact = false, className = '', ...props }) => (
  <Input
    className={`rounded-md border border-gray-600 bg-gray-900 text-sm text-gray-100 placeholder-gray-500 transition focus:border-accent-500 focus:ring-1 focus:ring-accent-500 focus:outline-none data-[disabled]:opacity-50 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} ${className}`}
    {...props}
  />
);

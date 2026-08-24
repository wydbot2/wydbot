import { type FC } from 'react';
import { Field, Label } from '@headlessui/react';
import { TextInput } from '../shared/TextInput';

interface TokenInputProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  showLabel?: boolean;
  disabled?: boolean;
  id?: string;
  error?: string;
}

export const TokenInput: FC<TokenInputProps> = ({
  value,
  onChange,
  compact = false,
  showLabel = true,
  disabled = false,
  id,
  error,
}) => {
  const errorId = id ? `${id}-error` : 'token-input-error';
  const input = (
    <TextInput
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]{4,6}"
      minLength={4}
      maxLength={6}
      required
      value={value}
      disabled={disabled}
      compact={compact}
      onChange={(e) => {
        const filtered = e.target.value.replace(/\D/g, '');
        onChange(filtered);
      }}
      className="w-full font-mono tracking-[0.12em]"
      placeholder="000000"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? errorId : undefined}
    />
  );

  if (!showLabel) return input;

  return (
    <Field className="flex flex-col gap-[5px]">
      <Label htmlFor={id} className="block text-xs font-medium text-gray-400">
        Senha numérica
      </Label>
      {input}
      {error && (
        <span id={errorId} className="text-[11px] text-red-400" role="alert">
          {error}
        </span>
      )}
    </Field>
  );
};

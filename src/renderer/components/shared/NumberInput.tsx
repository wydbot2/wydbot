import { type FC, useEffect, useState } from 'react';

interface NumberInputProps {
  // null = empty draft (inherits an external default); requires onClear.
  value: number | null;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}

export const NumberInput: FC<NumberInputProps> = ({
  value,
  min,
  max,
  onChange,
  onClear,
  placeholder,
  disabled,
  ariaLabel,
  title,
}) => {
  const [draft, setDraft] = useState(value == null ? '' : String(value));

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const raw = draft.trim();
    if (raw === '') {
      if (value != null) onClear?.();
      setDraft(value == null ? '' : String(value));
      return;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      title={title ?? `Valor entre ${min} e ${max}`}
      className="w-14 rounded border border-gray-600 bg-gray-900 px-1.5 py-0.5 text-center font-mono text-xs text-gray-100 tabular-nums placeholder:text-gray-500 focus:border-accent-500 focus:ring-1 focus:ring-accent-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
};

import { type FC, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/20/solid';

interface CopyButtonProps {
  value: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

const FEEDBACK_MS = 1200;

export const CopyButton: FC<CopyButtonProps> = ({ value, label, ariaLabel, className = '' }) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current ?? undefined);
    },
    [],
  );

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timeoutRef.current ?? undefined);
      timeoutRef.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
    },
    [value],
  );

  const computedAriaLabel = ariaLabel ?? `Copiar ${label ?? value}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={computedAriaLabel}
      title={copied ? 'Copiado' : 'Copiar'}
      // ring offset clips inside tooltip surface — divergence from Button's ghost-muted variant.
      className={`inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-500 ${copied ? 'text-accent-400' : 'text-gray-500 hover:bg-gray-700/55 hover:text-gray-200'} ${className}`}
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="h-[11px] w-[11px]" />
      ) : (
        <ClipboardDocumentIcon aria-hidden="true" className="h-[11px] w-[11px]" />
      )}
      {label !== undefined && <span>{label}</span>}
    </button>
  );
};

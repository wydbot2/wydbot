import { MenuItem } from '@headlessui/react';
import {
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  CheckIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/20/solid';
import { type FC, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getWydAPI } from '../../lib/electron-api';
import { SCRIPT_API_DOCS_MD } from '../../lib/script-api-docs.generated';
import { SplitButton } from '../shared/SplitButton';

const COPIED_FEEDBACK_MS = 1800;

const MENU_ITEM_BASE =
  'flex w-full cursor-pointer items-start gap-2.5 rounded p-2 text-left select-none data-[focus]:bg-gray-700';

/**
 * Script editor header split: opens the docs window (main segment) or copies
 * the whole API as markdown for pasting into an assistant (menu).
 */
export const DocsSplitButton: FC = () => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current ?? undefined);
    },
    [],
  );

  const openDocs = useCallback(() => {
    void getWydAPI()?.openDocs();
  }, []);

  // preventDefault keeps the menu open so the "copiado" feedback is visible.
  const handleCopy = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(SCRIPT_API_DOCS_MD);
      setCopied(true);
      clearTimeout(timerRef.current ?? undefined);
      timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      toast.error('Não consegui copiar — tente de novo');
    }
  }, []);

  return (
    <SplitButton
      label="Documentação"
      icon={<BookOpenIcon className="h-4 w-4" />}
      onClick={openDocs}
      title="Abrir a página de documentação"
      caretAriaLabel="Mais opções de documentação"
      menuAriaLabel="Opções de documentação"
    >
      <MenuItem>
        <button type="button" onClick={openDocs} className={MENU_ITEM_BASE}>
          <BookOpenIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-sm font-medium text-gray-100">
              Abrir documentação
              <ArrowTopRightOnSquareIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-gray-500"
              />
            </span>
            <span className="mt-0.5 block text-xs text-gray-400">
              Guia e referência da API, página completa
            </span>
          </span>
        </button>
      </MenuItem>

      <div className="mx-0.5 my-1 h-px bg-gray-700" role="separator" />

      <MenuItem>
        <button type="button" onClick={handleCopy} className={MENU_ITEM_BASE}>
          {copied ? (
            <CheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-100" />
          ) : (
            <DocumentDuplicateIcon
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-100" aria-live="polite">
              {copied ? 'Copiado!' : 'Copiar markdown da API'}
            </span>
            <span className="mt-0.5 block text-xs text-gray-400">
              Guia + referência da API para colar em um assistente
            </span>
          </span>
        </button>
      </MenuItem>
    </SplitButton>
  );
};

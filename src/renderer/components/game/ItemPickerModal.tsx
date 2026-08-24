import { DialogTitle } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { type FC, useEffect, useMemo, useState } from 'react';
import type { Item } from '@shared/types/item-db-types';
import { getItemDb } from '../../lib/item-db';
import { gradeToRarity } from '../../lib/item-rarity';
import { Modal } from '../shared/Modal';
import { AutoDropItemChip } from './misc/AutoDropItemChip';

interface ItemPickerModalProps {
  isOpen: boolean;
  existingIds: number[];
  onPick: (item: Item) => void;
  onClose: () => void;
}

const MAX_RESULTS = 8;

export const ItemPickerModal: FC<ItemPickerModalProps> = ({
  isOpen,
  existingIds,
  onPick,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Item[];
    const hits: Item[] = [];
    for (const it of getItemDb().items.values()) {
      if (!it.name) continue;
      if (String(it.id).includes(q) || it.name.toLowerCase().includes(q)) {
        hits.push(it);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [query]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      align="top"
      unpadded
      className="mt-[10vh] p-3"
    >
      <DialogTitle className="sr-only">Adicionar item</DialogTitle>
      <div className="flex items-center gap-2 rounded-md border border-gray-600 bg-gray-900 px-2.5 py-1.5 transition-colors focus-within:border-accent-500 focus-within:shadow-[0_0_0_1px_var(--color-accent-500)]">
        <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item por nome ou ID…"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-100 placeholder:text-gray-500 focus:outline-none"
        />
        {query && (
          <span className="shrink-0 font-mono text-[11px] text-gray-500">{results.length}</span>
        )}
      </div>

      <div className="mt-2 max-h-60 overflow-auto">
        {query.trim() && results.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-gray-500">
            Nenhum item encontrado para &ldquo;
            <span className="text-gray-300">{query}</span>&rdquo;.
          </div>
        ) : (
          results.map((it) => {
            const dupe = existing.has(it.id);
            return (
              <button
                key={it.id}
                type="button"
                disabled={dupe}
                onClick={() => onPick(it)}
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px] text-gray-300 transition-colors hover:bg-accent-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-gray-300"
              >
                <AutoDropItemChip
                  itemId={it.id}
                  rarity={gradeToRarity(it.grade)}
                  size={26}
                  dim={dupe}
                />
                <span className="flex-1 truncate">{it.name}</span>
                {dupe && (
                  <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] text-gray-500">
                    já adicionado
                  </span>
                )}
                <span className="font-mono text-[11px] text-gray-500">#{it.id}</span>
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
};

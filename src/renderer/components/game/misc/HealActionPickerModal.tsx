import { Radio, RadioGroup } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { type FC, useEffect, useMemo, useState } from 'react';
import type { HealAction } from '@shared/app-config/v1/sections/auto-healing';
import type { Item } from '@shared/types/item-db-types';
import { getItemDb } from '../../../lib/item-db';
import { Modal } from '../../shared/Modal';
import { AutoDropItemChip } from './AutoDropItemChip';
import { type ItemRarity } from '../personagem/character-tables';
import type { HealItemFilter } from './heal-catalogs';
import type { SkillCatalogEntry } from '../attack/attack-catalog';

type PickerMode = 'item' | 'skill';

interface HealActionPickerModalProps {
  isOpen: boolean;
  /** Header title — depends on the rule (HP, MP, etc.). */
  title: string;
  /** Item filter for the current rule (HP-pots / MP-pots / herbs / mount foods). */
  itemFilter: HealItemFilter;
  /** Learned heal/cure skills the rule can pick. Empty list disables the Skills tab. */
  skillCatalog: readonly SkillCatalogEntry[];
  /** Already-selected actions — used to render "já adicionado" dedup pill. */
  existingActions: readonly HealAction[];
  /** Initial tab when opening — defaults to `item`. */
  initialTab?: PickerMode;
  onPick: (action: HealAction) => void;
  onClose: () => void;
}

const MAX_RESULTS = 20;

const itemRarity = (gradeOrNull: number | undefined): ItemRarity => {
  if (gradeOrNull === undefined || gradeOrNull === 0) return 'common';
  if (gradeOrNull <= 5) return 'rare';
  if (gradeOrNull <= 9) return 'epic';
  return 'legend';
};

export const HealActionPickerModal: FC<HealActionPickerModalProps> = ({
  isOpen,
  title,
  itemFilter,
  skillCatalog,
  existingActions,
  initialTab = 'item',
  onPick,
  onClose,
}) => {
  const [tab, setTab] = useState<PickerMode>(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const existingItemIds = useMemo(
    () => new Set(existingActions.filter((a) => a.kind === 'item').map((a) => a.refId)),
    [existingActions],
  );
  const existingSkillIds = useMemo(
    () => new Set(existingActions.filter((a) => a.kind === 'skill').map((a) => a.refId)),
    [existingActions],
  );

  const itemResults = useMemo(() => {
    if (tab !== 'item') return [] as Item[];
    const q = query.trim().toLowerCase();
    const hits: Item[] = [];
    for (const it of getItemDb().items.values()) {
      if (!itemFilter(it)) continue;
      if (!it.name) continue;
      if (q && !String(it.id).includes(q) && !it.name.toLowerCase().includes(q)) continue;
      hits.push(it);
      if (hits.length >= MAX_RESULTS) break;
    }
    return hits;
  }, [tab, query, itemFilter]);

  const skillResults = useMemo(() => {
    if (tab !== 'skill') return [] as SkillCatalogEntry[];
    const q = query.trim().toLowerCase();
    return skillCatalog
      .filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.id).includes(q))
      .slice(0, MAX_RESULTS);
  }, [tab, query, skillCatalog]);

  const skillTabDisabled = skillCatalog.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" align="top" unpadded title={title}>
      <div className="flex flex-col gap-3 px-5 py-4">
        <RadioGroup
          value={tab}
          onChange={setTab}
          className="grid grid-cols-2 gap-1 rounded-md border border-gray-700 bg-gray-900/60 p-1"
        >
          <Radio
            value="item"
            className="cursor-pointer rounded px-3 py-1 text-center text-[11.5px] font-medium text-gray-400 transition-colors hover:text-gray-200 focus:outline-none data-[checked]:bg-gray-700 data-[checked]:text-gray-100"
          >
            Itens
          </Radio>
          <Radio
            value="skill"
            disabled={skillTabDisabled}
            className="cursor-pointer rounded px-3 py-1 text-center text-[11.5px] font-medium text-gray-400 transition-colors hover:text-gray-200 focus:outline-none data-[checked]:bg-gray-700 data-[checked]:text-gray-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
            title={skillTabDisabled ? 'Sem skills compatíveis para esta regra' : undefined}
          >
            Skills
          </Radio>
        </RadioGroup>

        <div className="flex items-center gap-2 rounded-md border border-gray-600 bg-gray-900 px-2.5 py-1.5 focus-within:border-accent-500">
          <MagnifyingGlassIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'item' ? 'Buscar item por nome ou ID…' : 'Buscar skill por nome…'}
            className="flex-1 bg-transparent text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <ul className="max-h-72 overflow-y-auto border-t border-gray-700/60">
        {tab === 'item' && itemResults.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-gray-500">
            Nenhum item encontrado{query ? ` para "${query}"` : ''}.
          </li>
        )}
        {tab === 'skill' && skillResults.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-gray-500">
            Nenhuma skill encontrada{query ? ` para "${query}"` : ''}.
          </li>
        )}

        {tab === 'item' &&
          itemResults.map((it) => {
            const dup = existingItemIds.has(it.id);
            return (
              <li key={it.id} className="border-b border-gray-800/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    if (dup) return;
                    onPick({ kind: 'item', refId: it.id });
                  }}
                  disabled={dup}
                  className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-accent-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AutoDropItemChip itemId={it.id} rarity={itemRarity(it.grade)} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium text-gray-200">{it.name}</span>
                    <span className="font-mono text-[10px] text-gray-500">
                      id {it.id} (0x{it.id.toString(16)})
                    </span>
                  </span>
                  {dup && (
                    <span className="shrink-0 rounded bg-gray-700/60 px-1.5 py-0.5 text-[10px] text-gray-400">
                      já adicionado
                    </span>
                  )}
                </button>
              </li>
            );
          })}

        {tab === 'skill' &&
          skillResults.map((s) => {
            const dup = existingSkillIds.has(s.id);
            return (
              <li key={s.id} className="border-b border-gray-800/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    if (dup) return;
                    onPick({ kind: 'skill', refId: s.id });
                  }}
                  disabled={dup}
                  className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-accent-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-cyan-400/30 bg-gray-800">
                    {s.iconUrl ? (
                      <img
                        src={s.iconUrl}
                        alt=""
                        className="h-full w-full object-contain p-0.5"
                        draggable={false}
                      />
                    ) : (
                      <span className="font-mono text-[10px] font-bold text-cyan-300">
                        {s.name[0]}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium text-gray-200">{s.name}</span>
                    <span className="font-mono text-[10px] text-gray-500">id {s.id}</span>
                  </span>
                  {dup && (
                    <span className="shrink-0 rounded bg-gray-700/60 px-1.5 py-0.5 text-[10px] text-gray-400">
                      já adicionado
                    </span>
                  )}
                </button>
              </li>
            );
          })}
      </ul>
    </Modal>
  );
};

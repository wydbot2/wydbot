import { type FC } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { useLogStore } from '../../stores/log-store';
import { Button } from '../shared/Button';

const LEVEL_OPTIONS = ['all', 'debug', 'info', 'warn', 'error'] as const;
const CATEGORY_OPTIONS = [
  'all',
  'protocol',
  'session',
  'ipc',
  'platform',
  'settings',
  'assets',
  'macro',
  'app',
] as const;

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

export const LogFilterBar: FC = () => {
  const { levelFilter, categoryFilter, setLevelFilter, setCategoryFilter, clear } = useLogStore(
    useShallow((s) => ({
      levelFilter: s.levelFilter,
      categoryFilter: s.categoryFilter,
      setLevelFilter: s.setLevelFilter,
      setCategoryFilter: s.setCategoryFilter,
      clear: s.clear,
    })),
  );

  const selectedLevel = levelFilter ?? 'all';
  const selectedCategory = categoryFilter ?? 'all';

  return (
    <div className="flex items-center gap-2">
      {/* Level filter */}
      <Listbox value={selectedLevel} onChange={(val) => setLevelFilter(val === 'all' ? null : val)}>
        <div className="relative">
          <ListboxButton
            className="relative w-28 cursor-pointer rounded-md border border-gray-600 bg-gray-800 py-1.5 pr-8 pl-2.5 text-left text-xs text-gray-100 shadow-sm transition hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            aria-label="Filtrar por nível"
          >
            <span
              className={`block truncate ${selectedLevel !== 'all' ? (LEVEL_COLORS[selectedLevel] ?? '') : ''}`}
            >
              {selectedLevel === 'all' ? 'Nível' : selectedLevel}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
              <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            </span>
          </ListboxButton>

          <ListboxOptions
            transition
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-gray-800 py-1 text-xs shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            {LEVEL_OPTIONS.map((level) => (
              <ListboxOption
                key={level}
                value={level}
                className="group relative cursor-pointer px-2.5 py-1.5 text-gray-300 select-none data-[focus]:bg-blue-600 data-[focus]:text-white"
              >
                <span
                  className={`block truncate group-data-[selected]:font-semibold ${level !== 'all' ? (LEVEL_COLORS[level] ?? '') : ''}`}
                >
                  {level === 'all' ? 'All' : level}
                </span>
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>

      {/* Category filter */}
      <Listbox
        value={selectedCategory}
        onChange={(val) => setCategoryFilter(val === 'all' ? null : val)}
      >
        <div className="relative">
          <ListboxButton
            className="relative w-28 cursor-pointer rounded-md border border-gray-600 bg-gray-800 py-1.5 pr-8 pl-2.5 text-left text-xs text-gray-100 shadow-sm transition hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            aria-label="Filtrar por categoria"
          >
            <span className="block truncate">
              {selectedCategory === 'all' ? 'Categoria' : selectedCategory}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
              <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            </span>
          </ListboxButton>

          <ListboxOptions
            transition
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-gray-800 py-1 text-xs shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <ListboxOption
                key={cat}
                value={cat}
                className="group relative cursor-pointer px-2.5 py-1.5 text-gray-300 select-none data-[focus]:bg-blue-600 data-[focus]:text-white"
              >
                <span className="block truncate group-data-[selected]:font-semibold">
                  {cat === 'all' ? 'All' : cat}
                </span>
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>

      <Button variant="ghost" className="ml-auto !px-2.5 !py-1.5 !text-xs" onClick={clear}>
        Limpar
      </Button>
    </div>
  );
};

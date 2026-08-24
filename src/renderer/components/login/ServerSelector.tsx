import { type FC } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import type { ServerChannel } from '@shared/constants/server-channels';

interface ServerSelectorProps {
  servers: ServerChannel[];
  selected: ServerChannel | null;
  onChange: (channel: ServerChannel | null) => void;
  compact?: boolean;
  /** Button shows channel name only (IP remains in the dropdown). */
  nameOnly?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
}

const labelFor = (channel: ServerChannel, nameOnly: boolean): string =>
  nameOnly ? channel.name : `${channel.name} (${channel.ip})`;

export const ServerSelector: FC<ServerSelectorProps> = ({
  servers,
  selected,
  onChange,
  compact = false,
  nameOnly = false,
  disabled = false,
  invalid = false,
  errorId,
}) => {
  return (
    <Listbox value={selected} onChange={onChange} disabled={disabled}>
      <div className="relative">
        <ListboxButton
          className={`relative w-full cursor-pointer border border-gray-600 bg-gray-800 text-left text-gray-100 shadow-sm transition hover:border-gray-500 focus:border-accent-500 focus:ring-1 focus:ring-accent-500 focus:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 ${
            compact
              ? 'rounded-md py-1.5 pr-7 pl-2 text-xs'
              : 'rounded-[8px] py-[9px] pr-9 pl-3 text-sm'
          }`}
          aria-label="Selecionar canal"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        >
          <span className="block truncate">
            {selected ? labelFor(selected, nameOnly) : 'Selecione um canal'}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5">
            <ChevronDownIcon
              className={`text-gray-400 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
              aria-hidden="true"
            />
          </span>
        </ListboxButton>

        <ListboxOptions
          transition
          className={`absolute z-10 mt-1 max-h-60 w-full min-w-[12rem] overflow-auto rounded-md bg-gray-800 py-1 shadow-lg ring-1 ring-black/20 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {servers.map((channel, idx) => (
            <ListboxOption
              key={`${channel.ip}:${channel.port}-${idx}`}
              value={channel}
              className={`group relative cursor-pointer text-gray-300 select-none data-[focus]:bg-accent-600 data-[focus]:text-white ${
                compact ? 'px-2 py-1.5' : 'px-3 py-2'
              }`}
            >
              <span className="block truncate group-data-[selected]:font-semibold">
                {channel.name}
                <span className="ml-2 text-[10px] text-gray-500 group-data-[focus]:text-accent-200">
                  {channel.ip}:{channel.port}
                </span>
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
};

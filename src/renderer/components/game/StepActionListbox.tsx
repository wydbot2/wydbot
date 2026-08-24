import { Fragment, type FC } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  CATEGORY_BORDER_LEFT,
  CATEGORY_LABELS,
  MACRO_SUBTYPE_OPTIONS,
  type MacroStepCategory,
  type MacroStepSubtype,
  type MacroSubtypeOption,
} from '../../stores/macro-labels';
import { CategoryDot } from './CategoryDot';
import { CategoryGroupHeader } from './CategoryGroupHeader';
import { SubtypeMenuItem } from './SubtypeMenuItem';

interface StepActionListboxProps {
  value: MacroStepSubtype;
  onChange: (subtype: MacroStepSubtype) => void;
  ariaLabel?: string;
}

const GROUPED_OPTIONS = MACRO_SUBTYPE_OPTIONS.reduce<
  Array<{ category: MacroStepCategory; items: MacroSubtypeOption[] }>
>((acc, option) => {
  const last = acc[acc.length - 1];
  if (last && last.category === option.category) {
    last.items.push(option);
  } else {
    acc.push({ category: option.category, items: [option] });
  }
  return acc;
}, []);

export const StepActionListbox: FC<StepActionListboxProps> = ({ value, onChange, ariaLabel }) => {
  const selected = MACRO_SUBTYPE_OPTIONS.find((o) => o.subtype === value);
  if (!selected) throw new Error(`StepActionListbox: unknown subtype "${value}"`);

  return (
    <Listbox value={value} onChange={onChange}>
      <ListboxButton
        aria-label={ariaLabel}
        className={`flex w-44 shrink-0 cursor-pointer items-center justify-between rounded-md border border-gray-600 bg-gray-800 py-1.5 pr-2 pl-0 text-left text-xs shadow-sm transition hover:border-gray-500 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500 ${CATEGORY_BORDER_LEFT[selected.category]}`}
      >
        <span className="flex items-center gap-2 truncate pl-2.5">
          <CategoryDot category={selected.category} size="sm" />
          <span className="text-[10px] font-semibold tracking-[0.12em] text-gray-400 uppercase">
            {CATEGORY_LABELS[selected.category]}
          </span>
          <span className="text-gray-600">/</span>
          <span className={`truncate font-medium ${selected.textColorClass}`}>
            {selected.label}
          </span>
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </ListboxButton>

      <ListboxOptions
        anchor="bottom start"
        transition
        className="z-50 max-h-72 w-[var(--button-width)] min-w-[13rem] overflow-auto rounded-md border border-gray-600 bg-gray-800 py-1 text-xs shadow-xl ring-1 ring-black/30 transition duration-150 focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        {GROUPED_OPTIONS.map(({ category, items }, i) => (
          <Fragment key={category}>
            {i > 0 && <hr className="my-1 border-gray-700" />}
            <CategoryGroupHeader category={category} />
            {items.map((option) => (
              <ListboxOption
                key={option.subtype}
                value={option.subtype}
                className="cursor-pointer data-[focus]:bg-accent-600/30 data-[selected]:bg-gray-700/40"
              >
                <SubtypeMenuItem option={option} />
              </ListboxOption>
            ))}
          </Fragment>
        ))}
      </ListboxOptions>
    </Listbox>
  );
};

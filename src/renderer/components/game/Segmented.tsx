interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Neutral two-option toggle in the system idiom (gray active fill); not boolean like Switch. */
export const Segmented = <T extends string>({ value, options, onChange }: SegmentedProps<T>) => (
  <div className="inline-flex overflow-hidden rounded-md border border-gray-600">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-3 py-1 text-[11px] font-medium transition-colors ${
          value === o.value ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:bg-gray-700/40'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

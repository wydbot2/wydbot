import { type FC, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import { useLogStore, selectFilteredEntries } from '../../stores/log-store';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-500',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

interface LogViewerProps {
  isActive: boolean;
}

export const LogViewer: FC<LogViewerProps> = ({ isActive }) => {
  const entries = useLogStore(useShallow(selectFilteredEntries));
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 20,
  });

  // Stable ref — virtualizer changes identity every render
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 40;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new entries arrive (if user is at bottom and tab is active)
  useEffect(() => {
    if (!isActive || !shouldAutoScroll.current || entries.length === 0) return;
    virtualizerRef.current.scrollToIndex(entries.length - 1, { align: 'end' });
  }, [entries.length, isActive]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-700 bg-gray-900">
        <span className="text-sm text-gray-500">Nenhum log registrado</span>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto rounded-lg border border-gray-700 bg-gray-900"
    >
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];
          const levelColor = LEVEL_COLORS[entry.level] ?? 'text-gray-300';

          return (
            <div
              key={virtualRow.index}
              className="absolute top-0 left-0 flex w-full items-center gap-2 px-2 font-mono text-xs"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <span className="shrink-0 text-gray-500">{formatTime(entry.timestamp)}</span>
              <span className={`w-10 shrink-0 uppercase ${levelColor}`}>{entry.level}</span>
              {entry.category && (
                <span className="shrink-0 rounded bg-gray-700 px-1.5 text-gray-300">
                  {entry.category}
                </span>
              )}
              <span className="truncate text-gray-200">{entry.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

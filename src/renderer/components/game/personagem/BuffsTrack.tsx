import { type FC, useMemo } from 'react';
import type { MAffectPacket } from '@shared/types';
import { AFFECT_NAME_MAP } from './character-tables';
import { BuffChip } from './BuffChip';

interface BuffsTrackProps {
  affects: MAffectPacket[];
  /** Wall-clock at IPC arrival; used by `BuffChip` to project remaining duration. */
  syncMs: number;
}

export const BuffsTrack: FC<BuffsTrackProps> = ({ affects, syncMs }) => {
  const { buffs, debuffs } = useMemo(() => {
    const b: MAffectPacket[] = [];
    const d: MAffectPacket[] = [];
    for (const a of affects) {
      if (a.type === 0 || a.timeOctets === 0) continue;
      const meta = AFFECT_NAME_MAP[a.type];
      // Skip mount/ride state — has its own HUD. Unknown types default to buff.
      if (meta?.kind === 'mount') continue;
      (meta?.kind === 'debuff' ? d : b).push(a);
    }
    return { buffs: b, debuffs: d };
  }, [affects]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-14 items-center gap-2 overflow-x-auto rounded-lg border border-cyan-400/20 bg-gray-900/40 px-2.5 whitespace-nowrap">
        <span className="w-14 shrink-0 pp-mini text-cyan-300/80">Buffs</span>
        {buffs.length === 0 ? (
          <span className="text-[11px] text-gray-500">—</span>
        ) : (
          buffs.map((a, i) => <BuffChip key={`${a.type}-${i}`} affect={a} syncMs={syncMs} />)
        )}
      </div>
      <div className="flex h-14 items-center gap-2 overflow-x-auto rounded-lg border border-red-400/20 bg-gray-900/40 px-2.5 whitespace-nowrap">
        <span className="w-14 shrink-0 pp-mini text-red-300/80">Debuffs</span>
        {debuffs.length === 0 ? (
          <span className="text-[11px] text-gray-500">—</span>
        ) : (
          debuffs.map((a, i) => <BuffChip key={`${a.type}-${i}`} affect={a} syncMs={syncMs} />)
        )}
      </div>
    </div>
  );
};

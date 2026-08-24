import { type FC } from 'react';
import { StatBar } from '../../shared/StatBar';
import { SectionCard } from '../../shared/SectionCard';
import { RESIST_META } from './character-tables';

interface ResistancesCardProps {
  resist: readonly [number, number, number, number];
}

export const ResistancesCard: FC<ResistancesCardProps> = ({ resist }) => (
  <SectionCard title="Resistências">
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {RESIST_META.map((meta, i) => {
        const value = resist[i];
        const Icon = meta.icon;
        return (
          <div key={meta.label} className="flex flex-col gap-[3px]">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.iconColor }} />
              <span className="flex-1 text-[11px] font-semibold tracking-[0.04em] text-gray-400 uppercase">
                {meta.label}
              </span>
              <span className="font-mono text-[11px] font-semibold text-gray-100">{value}%</span>
            </div>
            <StatBar
              label={meta.label}
              value={value}
              max={100}
              height={6}
              hideHeader
              shimmer={false}
              color={meta.gradient}
            />
          </div>
        );
      })}
    </div>
  </SectionCard>
);

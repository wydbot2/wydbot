import { type FC } from 'react';
import type { PlayerDisplayInfo } from '../../../stores/player-store';
import { AccentCard } from '../../shared/AccentCard';
import { AnimatedNumber } from '../../shared/AnimatedNumber';
import { SectionCard } from '../../shared/SectionCard';
import { PRIMARY_STAT_INDEX } from './character-tables';
import { sumGearStat } from './character-helpers';

interface PrimaryStatsCardProps {
  player: PlayerDisplayInfo;
}

interface StatCellProps {
  label: string;
  total: number;
  gear: number;
}

const StatCell: FC<StatCellProps> = ({ label, total, gear }) => (
  <AccentCard
    accent="var(--class-hue, var(--color-accent-500))"
    className="justify-center transition-transform duration-150 hover:-translate-y-px"
  >
    <div className="mb-1 text-[10px] font-semibold tracking-[0.1em] text-gray-400 uppercase">
      {label}
    </div>
    <div className="flex items-baseline gap-1.5 font-mono">
      <span className="text-[22px] leading-none font-bold text-gray-100">
        <AnimatedNumber value={total} />
      </span>
      {gear > 0 && (
        <span className="text-[11px] text-good">
          +<AnimatedNumber value={gear} />
        </span>
      )}
    </div>
  </AccentCard>
);

export const PrimaryStatsCard: FC<PrimaryStatsCardProps> = ({ player }) => {
  const strGear = sumGearStat(player.equip, PRIMARY_STAT_INDEX.str);
  const dexGear = sumGearStat(player.equip, PRIMARY_STAT_INDEX.dex);
  const intGear = sumGearStat(player.equip, PRIMARY_STAT_INDEX.int);
  const conGear = sumGearStat(player.equip, PRIMARY_STAT_INDEX.con);

  return (
    <SectionCard title="Atributos primários">
      <div className="grid flex-1 grid-cols-2 gap-1.5">
        <StatCell label="Força" total={player.str} gear={strGear} />
        <StatCell label="Destreza" total={player.dex} gear={dexGear} />
        <StatCell label="Inteligência" total={player.int} gear={intGear} />
        <StatCell label="Constituição" total={player.con} gear={conGear} />
      </div>
    </SectionCard>
  );
};

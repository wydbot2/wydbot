import { type FC } from 'react';
import type { PlayerDisplayInfo } from '../../../stores/player-store';
import { SectionCard } from '../../shared/SectionCard';

interface CombatStatsCardProps {
  player: PlayerDisplayInfo;
}

interface CombatRow {
  k: string;
  v: string;
}

const fmtNumber = (n: number): string => n.toLocaleString('pt-BR');
const fmtPct = (raw: number, divisor = 10): string => `${(raw / divisor).toFixed(1)}%`;

const buildRows = (p: PlayerDisplayInfo): CombatRow[] => [
  { k: 'Dano', v: fmtNumber(p.damage) },
  { k: 'Defesa', v: fmtNumber(p.defense) },
  { k: 'Vel. ataque', v: fmtPct(p.attackSpeed + 1000) },
  { k: 'Crítico', v: fmtPct(p.criticalRate * 4) },
  { k: 'Dano crítico', v: `${p.critDamageBonus}%` },
  { k: 'Red. dano crit.', v: `${p.critDamageReduction}%` },
  { k: 'Dano PvP', v: fmtPct(p.pvpDamage) },
  { k: 'Defesa PvP', v: fmtPct(p.pvpDefense) },
  { k: 'Penetração', v: fmtNumber(p.penetration) },
  { k: 'Absorção', v: fmtNumber(p.absorption) },
  { k: 'Precisão', v: fmtPct(p.accuracy) },
  { k: 'Evasão', v: fmtPct(p.evasion) },
  { k: 'Vel. movimento', v: fmtNumber(p.movementSpeed) },
  { k: 'Eco. mana', v: `${p.saveMana}%` },
];

export const CombatStatsCard: FC<CombatStatsCardProps> = ({ player }) => {
  const rows = buildRows(player);
  return (
    <SectionCard title="Combate">
      <div className="grid flex-1 grid-cols-2 content-between gap-x-4 gap-y-1">
        {rows.map((row, i) => (
          <div
            key={row.k}
            className={`flex items-baseline justify-between py-[3px] text-[11px] ${
              i < rows.length - 2 ? 'border-b border-dashed border-gray-700/30' : ''
            }`}
          >
            <span className="text-gray-400">{row.k}</span>
            <span className="font-mono font-semibold text-gray-100">{row.v}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

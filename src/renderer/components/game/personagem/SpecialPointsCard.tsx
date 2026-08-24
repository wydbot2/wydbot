import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../../../stores/player-store';
import { SectionCard } from '../../shared/SectionCard';
import { getMasteryCap } from './character-helpers';
import { SPECIAL_LABELS } from './character-tables';

interface SpecialPointsCardProps {
  charClass: number;
  evolutionTier: number;
  level: number;
  special: ReadonlyArray<number>;
}

const fmt = (n: number): string => n.toLocaleString('pt-BR');

export const SpecialPointsCard: FC<SpecialPointsCardProps> = ({
  charClass,
  evolutionTier,
  level,
  special,
}) => {
  const labels = SPECIAL_LABELS[charClass] ?? SPECIAL_LABELS[3];
  const { learnedSkill } = usePlayerStore(useShallow((s) => ({ learnedSkill: s.learnedSkill })));
  const maxes = getMasteryCap(charClass, level, evolutionTier === 2, learnedSkill);

  return (
    <SectionCard
      title="Aprendizagem de Skill"
      className="flex-1"
      rightSlot={<span className="pp-mini">Mastery</span>}
    >
      <div className="grid flex-1 grid-cols-2 content-around gap-x-4 gap-y-1.5">
        {labels.map((label, i) => {
          const cur = special[i] ?? 0;
          const max = maxes[i];
          return (
            <div
              key={`${label}-${i}`}
              className={`flex items-baseline justify-between gap-2 py-1 ${
                i < labels.length - 2 ? 'border-b border-dashed border-gray-700/30' : ''
              }`}
            >
              <span className="text-[11px] font-semibold tracking-[0.04em] text-gray-400 uppercase">
                {label}
              </span>
              <span className="font-mono text-[12px] font-semibold text-gray-100">
                {fmt(cur)}
                <span className="mx-px font-normal text-gray-500">/</span>
                {fmt(max)}
              </span>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

import { type CSSProperties, type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useConnectionStore } from '../../../stores/connection-store';
import type { PlayerDisplayInfo } from '../../../stores/player-store';
import { themeFor } from './character-helpers';
import { BuffsTrack } from './BuffsTrack';
import { CombatStatsCard } from './CombatStatsCard';
import { EquipmentPaperDoll } from './EquipmentPaperDoll';
import { HeroStripe } from './HeroStripe';
import { InventoryBags } from './InventoryBags';
import { PrimaryStatsCard } from './PrimaryStatsCard';
import { ResistancesCard } from './ResistancesCard';
import { SpecialPointsCard } from './SpecialPointsCard';

interface PersonagemPanelProps {
  player: PlayerDisplayInfo;
}

export const PersonagemPanel: FC<PersonagemPanelProps> = ({ player }) => {
  const { selectedChannel } = useConnectionStore(
    useShallow((s) => ({ selectedChannel: s.selectedChannel })),
  );
  const theme = themeFor(player.charClass, player.evolutionTier);
  const channel = selectedChannel?.name ?? '—';

  const rootStyle = {
    alignItems: 'stretch',
    '--class-hue': theme.hue,
    '--class-glow': theme.glow,
    '--class-ring': theme.ring,
  } as CSSProperties;

  return (
    <div className="pp-grid grid gap-3" style={rootStyle}>
      <div className="flex min-w-0 flex-col gap-3">
        <HeroStripe player={player} channel={channel} />
        <BuffsTrack affects={player.affects} syncMs={player.affectsSyncMs} />
        <div className="grid grid-cols-1 gap-3 min-[760px]:grid-cols-2">
          <PrimaryStatsCard player={player} />
          <CombatStatsCard player={player} />
        </div>
        <ResistancesCard resist={player.resist} />
        <SpecialPointsCard
          charClass={player.charClass}
          evolutionTier={player.evolutionTier}
          level={player.level}
          special={player.special}
        />
      </div>
      <div className="flex flex-col gap-3">
        <EquipmentPaperDoll equip={player.equip} />
        <InventoryBags
          inventory={player.inventory}
          gold={player.gold}
          bagUnlock={player.bagUnlock}
        />
      </div>
    </div>
  );
};

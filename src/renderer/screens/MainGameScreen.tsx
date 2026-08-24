import { type FC } from 'react';
import { CharacterPanel } from '../components/game/CharacterPanel';
import { AppConfigMenu } from '../components/game/AppConfigMenu';
import { AssetHealthBanner } from '../components/game/AssetHealthBanner';
import { usePlayer } from '../hooks/use-player';

export const MainGameScreen: FC = () => {
  const playerData = usePlayer();

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      <AssetHealthBanner />
      <AppConfigMenu />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <CharacterPanel player={playerData} />
      </div>
    </div>
  );
};

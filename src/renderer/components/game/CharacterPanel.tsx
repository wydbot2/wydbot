import { type FC, useState } from 'react';
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/react';
import type { PlayerDisplayInfo } from '../../stores/player-store';
import { PersonagemPanel } from './personagem/PersonagemPanel';
import { MacroPanel } from './MacroPanel';
import { MiscPanel } from './misc/MiscPanel';
import { LogViewer, LogFilterBar } from '../logs';

interface CharacterPanelProps {
  player: PlayerDisplayInfo;
}

export const CharacterPanel: FC<CharacterPanelProps> = ({ player }) => {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <TabGroup selectedIndex={selectedTab} onChange={setSelectedTab}>
      <TabList className="sticky top-0 z-10 mb-3 flex items-center gap-4 border-b border-gray-700/60 bg-gray-900 px-3">
        {['Personagem', 'Macro', 'Logs', 'Misc'].map((label) => (
          <Tab
            key={label}
            className="relative px-1.5 py-2 text-xs text-gray-400 transition-colors hover:text-gray-200 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:outline-none data-[selected]:text-gray-100"
          >
            {({ selected }) => (
              <span className="relative">
                {label}
                {selected && (
                  <span className="absolute right-0 -bottom-2 left-0 h-0.5 rounded-sm bg-accent-600" />
                )}
              </span>
            )}
          </Tab>
        ))}
      </TabList>

      <TabPanels>
        <TabPanel className="animate-tab-in motion-reduce:animate-none">
          <PersonagemPanel player={player} />
        </TabPanel>

        <TabPanel className="animate-tab-in motion-reduce:animate-none">
          <MacroPanel isActive={selectedTab === 1} />
        </TabPanel>

        <TabPanel className="animate-tab-in motion-reduce:animate-none">
          <div className="flex h-[calc(100vh-10rem)] min-h-[300px] flex-col gap-2">
            <LogFilterBar />
            <LogViewer isActive={selectedTab === 2} />
          </div>
        </TabPanel>

        <TabPanel className="animate-tab-in motion-reduce:animate-none">
          <MiscPanel />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  );
};

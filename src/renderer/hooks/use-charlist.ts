import { useShallow } from 'zustand/react/shallow';
import { useCharlistStore } from '../stores/charlist-store';
import { gameApi } from '../lib/game-api';

export const useCharlist = () => {
  const { selChar, selectedIndex, selectCharacter } = useCharlistStore(
    useShallow((charlist) => ({
      selChar: charlist.selChar,
      selectedIndex: charlist.selectedIndex,
      selectCharacter: charlist.selectCharacter,
    })),
  );

  const selectedName =
    selectedIndex >= 0 && selChar?.names[selectedIndex] ? selChar.names[selectedIndex].name : '';
  const hasSelection = selectedIndex >= 0 && selectedName.trim() !== '';

  return {
    selChar,
    selectedIndex,
    selectedName,
    hasSelection,
    select: selectCharacter,
    enter: () => {
      if (hasSelection) gameApi.selectCharacter(selectedIndex);
    },
  };
};

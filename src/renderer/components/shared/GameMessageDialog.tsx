import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/ui-store';
import { Button } from './Button';
import { Modal } from './Modal';

export const GameMessageDialog: FC = () => {
  const { activeModal, gameMessage, clearGameMessage } = useUIStore(
    useShallow((s) => ({
      activeModal: s.activeModal,
      gameMessage: s.gameMessage,
      clearGameMessage: s.clearGameMessage,
    })),
  );
  const isOpen = activeModal === 'game-message' && gameMessage !== null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={clearGameMessage}
      title="Aviso"
      footer={
        <Button onClick={clearGameMessage} aria-label="Fechar mensagem">
          OK
        </Button>
      }
    >
      <p className="text-sm text-gray-300">{gameMessage}</p>
    </Modal>
  );
};

import { type FC } from 'react';
import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import type { ProbeStatus } from '../../lib/npc-probe';

interface ProbeOverlayProps {
  status: ProbeStatus;
  onCancel: () => void;
}

const statusMessage = (status: ProbeStatus): string => {
  switch (status.status) {
    case 'approaching':
      return 'Aproximando do NPC...';
    case 'probing':
      return 'Aguardando resposta do servidor...';
    case 'done':
      return 'Identificado!';
    case 'error':
      return status.message;
  }
};

export const ProbeOverlay: FC<ProbeOverlayProps> = ({ status, onCancel }) => (
  <Modal
    isOpen
    onClose={onCancel}
    size="sm"
    title="Interagindo com NPC"
    footer={
      <Button variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    }
  >
    <div className="flex flex-col items-center gap-4 py-6">
      {status.status !== 'error' && (
        <ArrowPathIcon className="h-8 w-8 animate-spin text-accent-400" />
      )}
      <p className="text-center text-sm text-gray-300">{statusMessage(status)}</p>
    </div>
  </Modal>
);

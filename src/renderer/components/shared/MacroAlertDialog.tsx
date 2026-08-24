import { type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/ui-store';
import { acceptMacroAlert } from '../../lib/macro-alert-gate';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Blocking alert raised by a macro via `ctx.alert(...)`. Dismissing always goes
 * through `acceptMacroAlert` (button and overlay/Esc alike) so the awaiting
 * script is never left suspended.
 */
export const MacroAlertDialog: FC = () => {
  const { activeModal, macroAlert } = useUIStore(
    useShallow((ui) => ({
      activeModal: ui.activeModal,
      macroAlert: ui.macroAlert,
    })),
  );
  const isOpen = activeModal === 'macro-alert' && macroAlert !== null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={acceptMacroAlert}
      size="sm"
      title="Aviso"
      footer={
        <Button onClick={acceptMacroAlert} aria-label="Fechar aviso">
          Entendi
        </Button>
      }
    >
      <p className="text-sm whitespace-pre-line text-gray-300">{macroAlert}</p>
    </Modal>
  );
};

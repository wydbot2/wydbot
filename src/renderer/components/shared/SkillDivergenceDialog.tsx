import { type FC } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/ui-store';
import { Button } from './Button';
import { Modal } from './Modal';

/**
 * Compact informative modal: lists the skills removed from the loaded config
 * because the logged-in character hasn't learned them. The on-disk file is
 * untouched — reloading it with the right character restores the skills.
 */
export const SkillDivergenceDialog: FC = () => {
  const { activeModal, skillDivergence, closeSkillDivergence } = useUIStore(
    useShallow((ui) => ({
      activeModal: ui.activeModal,
      skillDivergence: ui.skillDivergence,
      closeSkillDivergence: ui.closeSkillDivergence,
    })),
  );
  const isOpen = activeModal === 'skill-divergence' && skillDivergence !== null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeSkillDivergence}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
          Skills não disponíveis
        </span>
      }
      footer={
        <Button onClick={closeSkillDivergence} aria-label="Fechar aviso">
          Entendi
        </Button>
      }
    >
      <p className="text-sm text-gray-300">
        Estas magias não estão aprendidas neste personagem e foram removidas da configuração
        carregada (o arquivo não foi alterado):
      </p>
      <div className="mt-3 space-y-3">
        {skillDivergence?.map((group) => (
          <div key={group.featureLabelPtBr}>
            <p className="text-sm font-semibold text-gray-200">{group.featureLabelPtBr}</p>
            <ul className="mt-1 space-y-0.5">
              {group.skills.map((skill) => (
                <li key={skill.id} className="text-sm text-gray-400">
                  • {skill.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
};

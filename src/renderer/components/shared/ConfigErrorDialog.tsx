import { type FC } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/ui-store';
import { dialogErrorTitle, dialogLead, type ConfigIssue } from '../../lib/config-issue-format';
import { Button } from './Button';
import { CopyButton } from './CopyButton';
import { Modal } from './Modal';

/** One problem row: location chip + pt-BR message. */
const IssueRow: FC<{ issue: ConfigIssue }> = ({ issue }) => (
  <div className="grid grid-cols-[auto_1fr] items-center gap-2.5 border-t border-gray-700/50 px-1 py-2 first:border-t-0">
    <span className="rounded-sm bg-gray-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap text-gray-400">
      {issue.local}
    </span>
    <span className="text-xs leading-snug text-gray-300">{issue.mensagem}</span>
  </div>
);

/**
 * Detail surface for config validation errors, opened from the "Ver detalhes"
 * action of the summarized toast. Store-driven (no props), mounted once at app
 * root next to the other global dialogs. Lists each problem in pt-BR; the raw
 * JSON is available via "Copiar detalhes" in the footer.
 */
export const ConfigErrorDialog: FC = () => {
  const { activeModal, configError, closeConfigError } = useUIStore(
    useShallow((ui) => ({
      activeModal: ui.activeModal,
      configError: ui.configError,
      closeConfigError: ui.closeConfigError,
    })),
  );
  const isOpen = activeModal === 'config-error' && configError !== null;
  const title = configError ? dialogErrorTitle(configError.issues.length, configError.context) : '';
  const lead = configError ? dialogLead(configError.context) : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeConfigError}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-[var(--color-bad)]" aria-hidden="true" />
          {title}
        </span>
      }
      footer={
        <>
          <CopyButton
            value={configError?.rawJson ?? ''}
            label="Copiar detalhes"
            className="mr-auto"
          />
          <Button variant="primary" onClick={closeConfigError} aria-label="Fechar">
            Fechar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-300">{lead}</p>
      <div className="border-t border-gray-700">
        {configError?.issues.map((issue, i) => (
          <IssueRow key={`${issue.local}-${i}`} issue={issue} />
        ))}
      </div>
    </Modal>
  );
};

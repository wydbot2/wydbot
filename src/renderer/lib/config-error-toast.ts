import { toast } from 'sonner';
import { useUIStore } from '../stores/ui-store';
import { configErrorDetail, toastErrorTitle, type ConfigIssue } from './config-issue-format';

interface ConfigErrorToastParams {
  issues: ConfigIssue[];
  /** Pretty-printed Zod issues for "Copiar detalhes" in the dialog. */
  rawJson: string;
  /** Which operation failed — drives the toast title and the dialog's title/lead. */
  context: 'save' | 'load';
  /** File name for the load-context title; ignored on save. */
  name?: string;
}

/**
 * Summarized error toast for config save/load failures. A regular sonner
 * `toast.error` — same frame/icon as every other system toast — plus a
 * "Ver detalhes" action that opens ConfigErrorDialog. Persists until dismissed
 * (`duration: Infinity`, ✕ close button).
 */
export const showConfigErrorToast = ({
  issues,
  rawJson,
  context,
  name,
}: ConfigErrorToastParams): void => {
  toast.error(toastErrorTitle(issues.length, context, name), {
    description: configErrorDetail(issues),
    action: {
      label: 'Ver detalhes',
      onClick: () => useUIStore.getState().showConfigError({ issues, rawJson, context }),
    },
    closeButton: true,
    duration: Infinity,
  });
};

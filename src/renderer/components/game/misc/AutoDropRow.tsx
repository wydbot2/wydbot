import { PlusIcon } from '@heroicons/react/20/solid';
import { type FC, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MISC_AUTO_DROP_MAX_RULES, type AutoDropRule } from '@shared/app-config';
import { getItem } from '../../../lib/item-db';
import { useAppConfigStore } from '../../../stores/app-config-store';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { AutoDropEditModal } from './AutoDropEditModal';
import { AutoDropItemPickerModal } from './AutoDropItemPickerModal';
import { AutoDropRuleChip } from './AutoDropRuleChip';
import { MiscCard } from './MiscCard';

interface AutoDropRowProps {
  disabled: boolean;
}

export const AutoDropRow: FC<AutoDropRowProps> = ({ disabled }) => {
  const { autoDrop, updateMiscAutoDrop } = useAppConfigStore(
    useShallow((s) => ({
      autoDrop: s.config.misc?.autoDrop,
      updateMiscAutoDrop: s.updateMiscAutoDrop,
    })),
  );

  const enabled = autoDrop?.enabled ?? false;
  const rules = autoDrop?.rules ?? [];

  const [editor, setEditor] = useState<{ index: number | null; rule: AutoDropRule } | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState<{ index: number; name: string } | null>(null);

  const setRules = (next: AutoDropRule[]): void => updateMiscAutoDrop({ rules: next });
  const atMax = rules.length >= MISC_AUTO_DROP_MAX_RULES;

  const requestRemove = (i: number): void => {
    const name = getItem(rules[i].itemId)?.name ?? `Item #${rules[i].itemId}`;
    setConfirm({ index: i, name });
  };

  return (
    <MiscCard
      title="Auto Drop"
      description="Descarta itens recém-lootados que casem a blacklist."
      enabled={enabled}
      onToggle={(v) => updateMiscAutoDrop({ enabled: v })}
      disabled={disabled}
      kind="always-on"
    >
      <div className="flex flex-wrap items-stretch gap-1.5">
        {rules.map((rule, i) => (
          <AutoDropRuleChip
            key={rule.itemId}
            rule={rule}
            onEdit={() => setEditor({ index: i, rule })}
            onRemove={() => requestRemove(i)}
            disabled={disabled}
          />
        ))}
        <button
          type="button"
          onClick={() => setPicker(true)}
          disabled={disabled || atMax}
          title={atMax ? `Máximo de ${MISC_AUTO_DROP_MAX_RULES} regras` : undefined}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 py-1.5 pr-2.5 pl-2 text-[11px] font-medium text-gray-400 transition-colors hover:border-cyan-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          adicionar regra
        </button>
        {rules.length === 0 && (
          <span className="self-center text-[11px] text-gray-500">Nenhuma regra de drop</span>
        )}
      </div>

      <AutoDropItemPickerModal
        isOpen={picker}
        existingIds={rules.map((r) => r.itemId)}
        onClose={() => setPicker(false)}
        onPick={(it) => {
          setPicker(false);
          setEditor({ index: null, rule: { itemId: it.id, dropGroups: [] } });
        }}
      />
      <AutoDropEditModal
        isOpen={editor != null}
        rule={editor?.rule}
        isEditing={editor?.index != null}
        onCancel={() => setEditor(null)}
        onSave={(next) => {
          if (!editor) return;
          setRules(
            editor.index === null
              ? [...rules, next]
              : rules.map((x, j) => (j === editor.index ? next : x)),
          );
          setEditor(null);
        }}
      />
      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.name}"?`}
        message="Essa regra sai da blacklist do Auto Drop. Você pode adicioná-la novamente depois."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) setRules(rules.filter((_, j) => j !== confirm.index));
          setConfirm(null);
        }}
      />
    </MiscCard>
  );
};

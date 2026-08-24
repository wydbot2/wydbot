import { type FC, useEffect, useState } from 'react';
import type { AutoDropAttr, AutoDropRule } from '@shared/app-config';
import { Button } from '../../shared/Button';
import { Modal } from '../../shared/Modal';
import { AutoDropRuleEditor } from './AutoDropRuleEditor';

interface AutoDropEditModalProps {
  isOpen: boolean;
  rule?: AutoDropRule;
  isEditing?: boolean;
  onSave: (rule: AutoDropRule) => void;
  onCancel: () => void;
}

/** Persist only non-empty groups — an empty group carries no predicate. */
const stripEmptyGroups = (groups: AutoDropAttr[][]): AutoDropAttr[][] =>
  groups.filter((g) => g.length > 0);

export const AutoDropEditModal: FC<AutoDropEditModalProps> = ({
  isOpen,
  rule,
  isEditing = false,
  onSave,
  onCancel,
}) => {
  const [dropGroups, setDropGroups] = useState<AutoDropAttr[][]>([]);
  const [keepGroups, setKeepGroups] = useState<AutoDropAttr[][]>([]);

  useEffect(() => {
    if (isOpen && rule) {
      setDropGroups(rule.dropGroups);
      setKeepGroups(rule.keepGroups ?? []);
    }
  }, [isOpen, rule]);

  const save = (): void => {
    if (!rule) return;
    const keeps = stripEmptyGroups(keepGroups);
    onSave({
      itemId: rule.itemId,
      dropGroups: stripEmptyGroups(dropGroups),
      ...(keeps.length > 0 ? { keepGroups: keeps } : {}),
    });
  };

  return (
    <Modal
      isOpen={isOpen && rule != null}
      onClose={onCancel}
      title={isEditing ? 'Editar regra' : 'Adicionar regra'}
      bodyClassName="max-h-[85vh] overflow-y-auto px-5 py-4"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save}>
            Salvar regra
          </Button>
        </>
      }
    >
      {rule && (
        <AutoDropRuleEditor
          rule={rule}
          dropGroups={dropGroups}
          onDropGroupsChange={setDropGroups}
          keepGroups={keepGroups}
          onKeepGroupsChange={setKeepGroups}
          isEditing={isEditing}
        />
      )}
    </Modal>
  );
};

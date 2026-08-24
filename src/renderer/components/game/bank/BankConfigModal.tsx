import { PlusIcon } from '@heroicons/react/20/solid';
import { type FC, type ReactNode, useEffect, useState } from 'react';
import { BANK_RULE_MAX, type BankRule, type InteractTarget } from '@shared/app-config';
import {
  buildBankTarget,
  canSaveBank,
  depositItemIds,
  goldRuleOf,
  withdrawItemIds,
} from '../../../lib/bank-rules';
import { getItem } from '../../../lib/item-db';
import { Button } from '../../shared/Button';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Modal } from '../../shared/Modal';
import { NumberInput } from '../../shared/NumberInput';
import { Switch } from '../../shared/Switch';
import { TextInput } from '../../shared/TextInput';
import { Segmented } from '../Segmented';
import { ItemPickerModal } from '../ItemPickerModal';
import { BankRuleChip } from './BankRuleChip';

interface BankConfigModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialNpcName: string;
  initialRules: BankRule[];
  initialFullStackOnly?: boolean;
  onSave: (target: InteractTarget) => void;
  onClose: () => void;
}

type ItemList = 'deposit' | 'withdraw';

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-400';
const nameOf = (itemId: number): string => getItem(itemId)?.name ?? `Item #${itemId}`;

export const BankConfigModal: FC<BankConfigModalProps> = ({
  isOpen,
  mode,
  initialNpcName,
  initialRules,
  initialFullStackOnly = false,
  onSave,
  onClose,
}) => {
  const [npcName, setNpcName] = useState('');
  const [depositIds, setDepositIds] = useState<number[]>([]);
  const [withdrawIds, setWithdrawIds] = useState<number[]>([]);
  const [goldDirection, setGoldDirection] = useState<ItemList>('deposit');
  const [goldAmount, setGoldAmount] = useState(0);
  const [fullStackOnly, setFullStackOnly] = useState(false);
  const [picker, setPicker] = useState<ItemList | null>(null);
  const [confirm, setConfirm] = useState<{ itemId: number; name: string; list: ItemList } | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;
    setNpcName(initialNpcName);
    setDepositIds(depositItemIds(initialRules));
    setWithdrawIds(withdrawItemIds(initialRules));
    const gold = goldRuleOf(initialRules);
    setGoldDirection(gold?.direction ?? 'deposit');
    setGoldAmount(gold?.amount ?? 0);
    setFullStackOnly(initialFullStackOnly);
    setPicker(null);
    setConfirm(null);
  }, [isOpen, initialNpcName, initialRules, initialFullStackOnly]);

  const draft = {
    npcName,
    depositIds,
    withdrawIds,
    goldDirection,
    goldAmount,
    depositFullStackOnly: fullStackOnly,
  };
  const hasGold = goldAmount >= 1;
  const ruleCount = depositIds.length + withdrawIds.length + (hasGold ? 1 : 0);
  const atMax = ruleCount >= BANK_RULE_MAX;
  const canSave = canSaveBank(draft);

  const idsOf = (list: ItemList): number[] => (list === 'deposit' ? depositIds : withdrawIds);
  const setIdsOf = (list: ItemList, next: number[]): void =>
    (list === 'deposit' ? setDepositIds : setWithdrawIds)(next);

  const renderList = (list: ItemList, label: string, emptyText: string): ReactNode => {
    const ids = idsOf(list);
    return (
      <div>
        <label className={LABEL_CLASS}>{label}</label>
        <div className="flex flex-wrap items-stretch gap-1.5">
          {ids.map((id) => (
            <BankRuleChip
              key={id}
              itemId={id}
              disabled={false}
              onRemove={() => setConfirm({ itemId: id, name: nameOf(id), list })}
            />
          ))}
          <button
            type="button"
            onClick={() => setPicker(list)}
            disabled={atMax}
            title={atMax ? `Máximo de ${BANK_RULE_MAX} regras` : undefined}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-gray-600/60 bg-gray-900/40 py-1.5 pr-2.5 pl-2 text-[11px] font-medium text-gray-400 transition-colors hover:border-emerald-400/60 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            adicionar item
          </button>
          {ids.length === 0 && (
            <span className="self-center text-[11px] text-gray-500">{emptyText}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={mode === 'edit' ? 'Editar banco' : 'Configurar banco'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => onSave(buildBankTarget(draft))}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>NPC (banco)</label>
          <TextInput
            type="text"
            value={npcName}
            onChange={(e) => setNpcName((e.target as HTMLInputElement).value)}
            className="w-full"
          />
        </div>

        {renderList('deposit', 'Depositar itens', 'Nenhum item para depositar')}

        <div className="flex items-center gap-2">
          <Switch
            aria-label="Depositar apenas stacks completas"
            checked={fullStackOnly}
            onChange={setFullStackOnly}
          />
          <div>
            <span className="text-[11px] font-medium text-gray-300">
              Depositar apenas stacks completas
            </span>
            <p className="text-[11px] text-gray-500">
              Itens empilháveis só são depositados com a pilha cheia (ex.: Poeira de Lac com
              120/120). Itens não empilháveis são depositados normalmente.
            </p>
          </div>
        </div>

        {renderList('withdraw', 'Sacar itens', 'Nenhum item para sacar')}

        <div>
          <label className={LABEL_CLASS}>Ouro</label>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={goldDirection}
              options={[
                { value: 'deposit', label: 'Depositar' },
                { value: 'withdraw', label: 'Sacar' },
              ]}
              onChange={setGoldDirection}
            />
            <span className="inline-flex items-center gap-2">
              <NumberInput
                value={goldAmount}
                min={0}
                max={0xffffffff}
                onChange={setGoldAmount}
                ariaLabel="Quantidade de ouro"
              />
              <span className="text-[11px] font-medium text-gray-500">de ouro</span>
            </span>
            <span className="text-[11px] text-gray-500">0 = não mexe no ouro</span>
          </div>
        </div>
      </div>

      <ItemPickerModal
        isOpen={picker != null}
        existingIds={picker ? idsOf(picker) : []}
        onClose={() => setPicker(null)}
        onPick={(it) => {
          if (picker) {
            const ids = idsOf(picker);
            if (!ids.includes(it.id)) setIdsOf(picker, [...ids, it.id]);
          }
          setPicker(null);
        }}
      />
      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.name}"?`}
        message="Esse item sai da lista. Você pode adicioná-lo novamente depois."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm)
            setIdsOf(
              confirm.list,
              idsOf(confirm.list).filter((id) => id !== confirm.itemId),
            );
          setConfirm(null);
        }}
      />
    </Modal>
  );
};

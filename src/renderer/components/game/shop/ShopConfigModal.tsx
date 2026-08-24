import { PlusIcon } from '@heroicons/react/20/solid';
import { type FC, useEffect, useState } from 'react';
import type { IpcShopItem } from '@shared/ipc/ipc-api';
import {
  SHOP_RULE_MAX,
  type InteractTarget,
  type ShopOpen,
  type ShopRule,
} from '@shared/app-config';
import { buildShopTarget, canSaveShop } from '../../../lib/shop-rules';
import { getItem } from '../../../lib/item-db';
import { Button } from '../../shared/Button';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Modal } from '../../shared/Modal';
import { TextInput } from '../../shared/TextInput';
import { ItemPickerModal } from '../ItemPickerModal';
import { ShopItemGrid } from './ShopItemGrid';
import { ShopRuleChip } from './ShopRuleChip';

interface ShopConfigModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialNpcName: string;
  initialRules: ShopRule[];
  /** Probe-proven open path (SoT); defaults to dialog on legacy edit. */
  initialOpen?: ShopOpen;
  shopItems?: IpcShopItem[];
  onSave: (target: InteractTarget) => void;
  onClose: () => void;
}

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-400';
const nameOf = (itemId: number): string => getItem(itemId)?.name ?? `Item #${itemId}`;

export const ShopConfigModal: FC<ShopConfigModalProps> = ({
  isOpen,
  mode,
  initialNpcName,
  initialRules,
  initialOpen = 'dialog',
  shopItems,
  onSave,
  onClose,
}) => {
  const [npcName, setNpcName] = useState('');
  const [rules, setRules] = useState<ShopRule[]>([]);
  const [open, setOpen] = useState<ShopOpen>('dialog');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ itemId: number; name: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNpcName(initialNpcName);
    setRules(initialRules);
    setOpen(initialOpen);
    setPickerOpen(false);
    setConfirm(null);
  }, [isOpen, initialNpcName, initialRules, initialOpen]);

  const draft = { npcName, rules, open };
  const canSave = canSaveShop(draft);
  const selectedIds = rules.map((r) => r.itemId);
  const atMax = rules.length >= SHOP_RULE_MAX;
  const hasLiveGrid = (shopItems?.length ?? 0) > 0;

  const addRule = (itemId: number): void => {
    if (atMax || selectedIds.includes(itemId)) return;
    setRules((prev) => [...prev, { itemId, quantity: 1 }]);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={mode === 'edit' ? 'Editar loja' : 'Configurar loja'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() => onSave(buildShopTarget(draft))}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>NPC (loja)</label>
          <TextInput
            type="text"
            value={npcName}
            onChange={(e) => setNpcName((e.target as HTMLInputElement).value)}
            className="w-full"
          />
        </div>

        {hasLiveGrid && (
          <div>
            <label className={LABEL_CLASS}>Itens disponíveis na loja</label>
            <ShopItemGrid items={shopItems!} selectedIds={selectedIds} onPick={addRule} />
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>Itens para comprar</label>
          <div className="flex flex-wrap items-stretch gap-1.5">
            {rules.map((r) => (
              <ShopRuleChip
                key={r.itemId}
                itemId={r.itemId}
                quantity={r.quantity}
                disabled={false}
                onQuantityChange={(qty) =>
                  setRules((prev) =>
                    prev.map((p) => (p.itemId === r.itemId ? { ...p, quantity: qty } : p)),
                  )
                }
                onRemove={() => setConfirm({ itemId: r.itemId, name: nameOf(r.itemId) })}
              />
            ))}
            {!atMax && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-gray-600 px-2 text-[11px] text-gray-400 hover:border-gray-400 hover:text-gray-200"
              >
                <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {hasLiveGrid ? 'Outro item' : 'Adicionar'}
              </button>
            )}
            {rules.length === 0 && (
              <span className="self-center text-[11px] text-gray-500">Nenhum item selecionado</span>
            )}
          </div>
        </div>
      </div>

      <ItemPickerModal
        isOpen={pickerOpen}
        existingIds={selectedIds}
        onPick={(item) => {
          addRule(item.id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirm != null}
        title={`Remover "${confirm?.name}"?`}
        message="Esse item sai da lista de compras. Você pode adicioná-lo novamente depois."
        confirmLabel="Remover"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) setRules((prev) => prev.filter((r) => r.itemId !== confirm.itemId));
          setConfirm(null);
        }}
      />
    </Modal>
  );
};

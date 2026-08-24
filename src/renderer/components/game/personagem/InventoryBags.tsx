import { type FC, useState } from 'react';
import type { ViewItem } from '@shared/types/item-types';
import { gameApi } from '../../../lib/game-api';
import { AnimatedNumber } from '../../shared/AnimatedNumber';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { PageTabs } from '../../shared/PageTabs';
import { SectionCard } from '../../shared/SectionCard';
import { BauDialog } from './BauDialog';
import { BAG_COUNT, BAG_SIZE, isBagLocked } from './character-tables';
import { InvCell } from './InvCell';
import { ItemContextMenu } from './ItemContextMenu';

interface InventoryBagsProps {
  inventory: ViewItem[];
  gold: number;
  bagUnlock: readonly boolean[];
}

export const InventoryBags: FC<InventoryBagsProps> = ({ inventory, gold, bagUnlock }) => {
  const [active, setActive] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{
    slot: number;
    item: ViewItem;
    x: number;
    y: number;
  } | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ slot: number; item: ViewItem } | null>(null);
  const [bauOpen, setBauOpen] = useState(false);
  const isLocked = isBagLocked(active, bagUnlock);
  const items = inventory.slice(active * BAG_SIZE, (active + 1) * BAG_SIZE);
  const usedCount = items.filter((it) => it != null && it.index !== 0).length;

  return (
    <SectionCard
      title="Inventário"
      className="flex-1"
      rightSlot={
        <button
          type="button"
          onClick={() => setBauOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-400/80 transition-colors hover:text-accent-300"
        >
          [Baú]
        </button>
      }
    >
      <div className="mb-4">
        <PageTabs
          count={BAG_COUNT}
          active={active}
          onSelect={setActive}
          renderLabel={(i) => `Bolsa ${i + 1}`}
          isLocked={(i) => isBagLocked(i, bagUnlock)}
        />
      </div>
      <div
        className="relative grid w-full gap-y-3"
        style={{ gridTemplateColumns: 'repeat(5, 56px)', justifyContent: 'space-between' }}
      >
        {Array.from({ length: BAG_SIZE }, (_, i) => {
          const item = items[i];
          return (
            <InvCell
              key={i}
              item={item}
              locked={isLocked}
              onContextMenu={(e) => {
                if (isLocked || !item || item.index === 0) return;
                e.preventDefault();
                setCtxMenu({ slot: active * BAG_SIZE + i, item, x: e.clientX, y: e.clientY });
              }}
            />
          );
        })}
        {isLocked && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{
              background:
                'repeating-linear-gradient(45deg, rgb(0 0 0 / 0.2) 0 8px, transparent 8px 16px)',
            }}
          />
        )}
      </div>
      <div className="flex-1" aria-hidden />
      <div className="border-t border-gray-700/40 pt-2 text-[11px]">
        <div className="flex items-baseline justify-between">
          <span className="text-gray-400">Gold</span>
          <span className="font-mono font-semibold text-gold">
            <AnimatedNumber value={gold} />
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-gray-400">Slots em uso</span>
          <span className="font-mono font-semibold text-gray-100">
            {usedCount} <span className="text-gray-500">/</span> {BAG_SIZE}
          </span>
        </div>
      </div>

      <BauDialog isOpen={bauOpen} onClose={() => setBauOpen(false)} />

      {ctxMenu && (
        <ItemContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          onDelete={() => {
            setConfirmTarget({ slot: ctxMenu.slot, item: ctxMenu.item });
            setCtxMenu(null);
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        title="Excluir item"
        message={
          confirmTarget
            ? `Deseja realmente excluir "${confirmTarget.item.name}"? Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (confirmTarget) gameApi.itemDestroy(confirmTarget.slot, confirmTarget.item.index);
          setConfirmTarget(null);
        }}
        onCancel={() => setConfirmTarget(null)}
      />
    </SectionCard>
  );
};

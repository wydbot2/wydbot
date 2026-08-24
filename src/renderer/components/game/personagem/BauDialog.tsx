import { XMarkIcon } from '@heroicons/react/20/solid';
import { type FC, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../../../stores/player-store';
import { AnimatedNumber } from '../../shared/AnimatedNumber';
import { Modal } from '../../shared/Modal';
import { PageTabs } from '../../shared/PageTabs';
import { BAU_PAGE_COUNT, BAU_PAGE_SIZE } from './character-tables';
import { InvCell } from './InvCell';

interface BauDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BauDialog: FC<BauDialogProps> = ({ isOpen, onClose }) => {
  const [active, setActive] = useState(0);
  const { storage, bankGold } = usePlayerStore(
    useShallow((s) => ({ storage: s.storage, bankGold: s.bankGold })),
  );
  const items = storage.slice(active * BAU_PAGE_SIZE, (active + 1) * BAU_PAGE_SIZE);
  const usedCount = storage.filter((it) => it != null && it.index !== 0).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Baú"
      size="sm"
      bodyClassName="px-4 py-3"
      headerAction={
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-100"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      }
      footer={
        <div className="w-full text-[11px]">
          <div className="flex items-baseline justify-between">
            <span className="text-gray-400">Gold</span>
            <span className="font-mono font-semibold text-gold">
              <AnimatedNumber value={bankGold} />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-gray-400">Slots em uso</span>
            <span className="font-mono font-semibold text-gray-100">
              {usedCount} <span className="text-gray-500">/</span> {BAU_PAGE_COUNT * BAU_PAGE_SIZE}
            </span>
          </div>
        </div>
      }
    >
      <div className="mb-3">
        <PageTabs
          count={BAU_PAGE_COUNT}
          active={active}
          onSelect={setActive}
          renderLabel={(i) => `Página ${i + 1}`}
        />
      </div>
      <div
        className="grid w-full gap-y-3"
        style={{ gridTemplateColumns: 'repeat(5, 56px)', justifyContent: 'space-between' }}
      >
        {Array.from({ length: BAU_PAGE_SIZE }, (_, i) => {
          const idx = active * BAU_PAGE_SIZE + i;
          return <InvCell key={idx} item={items[i]} />;
        })}
      </div>
    </Modal>
  );
};

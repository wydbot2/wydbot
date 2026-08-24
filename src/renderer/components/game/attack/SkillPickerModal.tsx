import { type FC, useEffect, useMemo, useState } from 'react';
import { Button } from '../../shared/Button';
import { Modal } from '../../shared/Modal';
import type { SkillCatalogEntry } from './attack-catalog';

interface SkillPickerModalProps {
  isOpen: boolean;
  priority: number;
  current: { id: number; name: string } | null;
  available: readonly SkillCatalogEntry[];
  disabledIds?: readonly number[];
  onClose: () => void;
  // null = clear the slot
  onConfirm: (skillId: number | null) => void;
}

export const SkillPickerModal: FC<SkillPickerModalProps> = ({
  isOpen,
  priority,
  current,
  available,
  disabledIds = [],
  onClose,
  onConfirm,
}) => {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) setSelected(current?.id ?? null);
  }, [isOpen, current?.id]);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  const handleClear = () => {
    onConfirm(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      unpadded
      className="overflow-hidden"
      title={`Slot ${priority} — escolher skill`}
    >
      <div className="max-h-[320px] overflow-auto px-3 py-3">
        {available.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-gray-500">
            Nenhuma skill disponível
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {available.map((skill) => {
              const isCurrent = current?.id === skill.id;
              const isUsed = !isCurrent && disabledSet.has(skill.id);
              const isSelected = selected === skill.id;

              const stateClass = isUsed
                ? 'cursor-not-allowed opacity-50'
                : isSelected
                  ? 'bg-cyan-400/15 text-cyan-100'
                  : 'text-gray-200 hover:bg-gray-700/40';

              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => !isUsed && setSelected(skill.id)}
                  disabled={isUsed}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${stateClass}`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-gray-700 bg-gray-900">
                    {skill.iconUrl ? (
                      <img src={skill.iconUrl} className="h-7 w-7" alt="" />
                    ) : (
                      <span className="h-7 w-7" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{skill.name}</span>
                  {skill.cooldownSecs > 0 && (
                    <span className="shrink-0 font-mono text-[11px] text-gray-400 tabular-nums">
                      {skill.cooldownSecs}s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-700 px-5 py-3">
        {current ? (
          <Button variant="ghost-danger" onClick={handleClear}>
            Limpar slot
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  );
};

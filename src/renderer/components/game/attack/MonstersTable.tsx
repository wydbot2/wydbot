import { type FC, type ReactNode, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import type { MonsterTarget } from '@shared/app-config';
import { MAX_GIVEUP_TIMEOUT_SEC, MIN_GIVEUP_TIMEOUT_SEC } from '@shared/constants/attack';
import { ListPanel } from '../ListPanel';
import { RowActions } from '../RowActions';
import { Button } from '../../shared/Button';
import { NumberInput } from '../../shared/NumberInput';
import { scrollRowIntoView } from '../../../lib/scroll-into-view';
import '../personagem/character-icons';

interface MonstersTableProps {
  monsters: readonly MonsterTarget[];
  giveUpDefaultSec: number;
  isRunning?: boolean;
  currentIndex?: number;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onGiveUpChange: (index: number, timeoutSec: number | null) => void;
  addForm: ReactNode;
}

const EmptyState: FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
    <Icon icon="game-icons:tentacles-skull" className="h-8 w-8 text-gray-600" aria-hidden="true" />
    <span className="text-sm font-medium text-gray-400">Nenhum monstro adicionado</span>
    <span className="text-xs text-gray-500">Digite o nome abaixo para começar</span>
  </div>
);

export const MonstersTable: FC<MonstersTableProps> = ({
  monsters,
  giveUpDefaultSec,
  isRunning,
  currentIndex,
  onRemove,
  onMove,
  onGiveUpChange,
  addForm,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const lastRowRef = useRef<HTMLTableRowElement | null>(null);
  const prevMonsterCount = useRef(monsters.length);

  useEffect(() => {
    if (currentIndex == null) return;
    scrollRowIntoView(scrollRef.current, activeRowRef.current);
  }, [currentIndex]);

  useEffect(() => {
    if (monsters.length > prevMonsterCount.current) {
      scrollRowIntoView(scrollRef.current, lastRowRef.current);
    }
    prevMonsterCount.current = monsters.length;
  }, [monsters.length]);

  return (
    <div className="flex h-full max-h-[320px] min-h-[200px] flex-col">
      <ListPanel className="min-h-0 flex-1" footer={addForm}>
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-auto">
          {monsters.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 text-left text-[11px] font-semibold tracking-[0.08em] text-gray-300 uppercase">
                  <th className="w-10 px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Nome</th>
                  <th
                    className="w-[148px] px-3 py-2.5"
                    title="Segundos atacando o mesmo alvo antes de desistir e pular para o próximo. Vazio = herda o padrão."
                  >
                    Desistência (s)
                  </th>
                  <th className="w-24 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {monsters.map((m, i) => {
                  const isLast = i === monsters.length - 1;
                  const isActive = currentIndex === i;
                  const hasOverride = m.giveUpTimeoutSec != null;

                  const rowClass = isActive ? 'bg-cyan-500/20' : '';
                  const borderClass = isActive
                    ? 'border-l-2 border-l-cyan-400'
                    : 'border-l-2 border-l-transparent';
                  const indexClass = isActive ? 'font-bold text-cyan-400' : 'text-gray-500';

                  return (
                    <tr
                      key={i}
                      ref={(el) => {
                        if (isActive) activeRowRef.current = el;
                        if (isLast) lastRowRef.current = el;
                      }}
                      className={`group border-b border-b-gray-700/50 text-gray-300 last:border-b-0 ${rowClass}`}
                    >
                      <td className={`py-1 pr-3 pl-2.5 align-middle ${borderClass} ${indexClass}`}>
                        {i + 1}
                      </td>
                      <td className="truncate px-3 py-1 align-middle">{m.name}</td>
                      <td className="px-3 py-1 align-middle">
                        <div className="flex items-center gap-1.5">
                          <NumberInput
                            value={m.giveUpTimeoutSec ?? null}
                            min={MIN_GIVEUP_TIMEOUT_SEC}
                            max={MAX_GIVEUP_TIMEOUT_SEC}
                            placeholder={String(giveUpDefaultSec)}
                            onChange={(v) => onGiveUpChange(i, v)}
                            onClear={() => onGiveUpChange(i, null)}
                            disabled={isRunning}
                            ariaLabel={`Desistência de ${m.name}, em segundos`}
                            title={
                              hasOverride
                                ? `Desistência própria — limpe o campo para herdar o padrão (${giveUpDefaultSec}s)`
                                : `Vazio = herda o padrão (${giveUpDefaultSec}s). Digite para definir um tempo só para este monstro.`
                            }
                          />
                          {hasOverride && (
                            <Button
                              variant="ghost-muted"
                              size="icon-xs"
                              onClick={() => onGiveUpChange(i, null)}
                              disabled={isRunning}
                              aria-label="Limpar valor próprio"
                              title={`Voltar a herdar o padrão (${giveUpDefaultSec}s)`}
                              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="py-1 pr-3 pl-1 align-middle">
                        <RowActions
                          itemLabel={`monstro ${i + 1}`}
                          isFirst={i === 0}
                          isLast={isLast}
                          disabled={isRunning}
                          onMoveUp={() => onMove(i, 'up')}
                          onMoveDown={() => onMove(i, 'down')}
                          onRemove={() => onRemove(i)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </ListPanel>
    </div>
  );
};

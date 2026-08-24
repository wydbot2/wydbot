import { type FC, type ReactNode } from 'react';
import { TrashIcon } from '@heroicons/react/20/solid';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { Button } from '../../shared/Button';
import { Tooltip } from '../../shared/Tooltip';
import { ListPanel } from '../ListPanel';

export interface WhitelistRow {
  name: string;
  inGroup: boolean;
}

interface WhitelistTableProps {
  rows: WhitelistRow[];
  disabled?: boolean;
  onRequestRemove: (name: string) => void;
  addForm: ReactNode;
}

const EmptyState: FC = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
    <UserGroupIcon className="h-8 w-8 text-gray-600" aria-hidden="true" />
    <span className="text-sm font-medium text-gray-400">Nenhum jogador na whitelist</span>
    <span className="text-xs text-gray-500">Digite um nome abaixo para começar</span>
  </div>
);

/** Whitelist of player names with a "no grupo / ausente" status column. Remove-only. */
export const WhitelistTable: FC<WhitelistTableProps> = ({
  rows,
  disabled,
  onRequestRemove,
  addForm,
}) => (
  // Fixed body height (~4 rows); empty state fills it, rows scroll within it.
  <div className="flex flex-col">
    <ListPanel footer={addForm}>
      <div className="flex h-[168px] flex-col overflow-auto">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-800 text-left text-[11px] font-semibold tracking-[0.08em] text-gray-300 uppercase">
                <th className="w-6 px-2 py-2.5" />
                <th className="px-3 py-2.5">Nome</th>
                <th className="w-24 px-3 py-2.5">Status</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-b-gray-700/50 text-gray-300 last:border-b-0"
                >
                  <td className="py-1 pr-1 pl-2.5 align-middle">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${row.inGroup ? 'bg-emerald-400' : 'bg-gray-600'}`}
                    />
                  </td>
                  <td className="truncate px-3 py-1 align-middle">{row.name}</td>
                  <td
                    className={`px-3 py-1 align-middle text-xs ${row.inGroup ? 'text-emerald-400' : 'text-gray-500'}`}
                  >
                    {row.inGroup ? 'no grupo' : 'ausente'}
                  </td>
                  <td className="py-1 pr-3 pl-1 text-right align-middle">
                    <Tooltip content="Remover" placement="top">
                      <Button
                        variant="ghost-danger"
                        size="icon-xs"
                        onClick={() => onRequestRemove(row.name)}
                        disabled={disabled}
                        aria-label={`Remover ${row.name}`}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </Button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ListPanel>
  </div>
);

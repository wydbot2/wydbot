import { LockClosedIcon } from '@heroicons/react/20/solid';
import type { FC, ReactNode } from 'react';
import { Button } from '../../shared/Button';

interface LockedShellProps {
  locked: boolean;
  children: ReactNode;
}

export const LockedShell: FC<LockedShellProps> = ({ locked, children }) => (
  <div className="relative">
    <div
      aria-hidden={locked || undefined}
      className={`transition-opacity ${locked ? 'pointer-events-none opacity-60' : 'opacity-100'}`}
    >
      {children}
    </div>
  </div>
);

interface LockBannerProps {
  locked: boolean;
  onPause: () => void;
  children: ReactNode;
}

export const LockBanner: FC<LockBannerProps> = ({ locked, onPause, children }) => (
  <div className="relative">
    {locked && (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-300">
        <LockClosedIcon className="h-3.5 w-3.5" />
        <span className="font-medium">Macro rodando</span>
        <span className="text-amber-300/80">· configurações em modo somente leitura.</span>
        <Button variant="warning" size="sm" className="ml-auto" onClick={onPause}>
          Pausar para editar
        </Button>
      </div>
    )}
    <LockedShell locked={locked}>{children}</LockedShell>
  </div>
);

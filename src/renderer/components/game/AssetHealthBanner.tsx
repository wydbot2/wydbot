import { type FC } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { useAssetHealthStore } from '../../stores/asset-health-store';

/**
 * Persistent, non-dismissable strip shown at the top of the game view when the
 * item/skill database loaded degraded (a boot-critical asset the client couldn't
 * parse). Makes a partial DB visible instead of silently showing "Item #<id>"
 * placeholders. It clears only on a clean reload — there is no close button.
 */
export const AssetHealthBanner: FC = () => {
  const health = useAssetHealthStore((asset) => asset.health);
  if (!health || health.failures.length === 0) return null;

  const assets = health.failures.map((f) => f.asset).join(', ');

  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-amber-200"
      style={{
        background: 'rgba(120,53,15,0.35)',
        borderBottom: '1px solid rgba(245,158,11,0.35)',
      }}
    >
      <ExclamationTriangleIcon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        Dados do jogo desatualizados ou incompletos — algumas estatísticas e ícones podem faltar.
        Reabra o WYDBot para tentar atualizar.
      </span>
      <span className="hidden font-mono text-[10px] text-amber-300/70 sm:inline">{assets}</span>
    </div>
  );
};

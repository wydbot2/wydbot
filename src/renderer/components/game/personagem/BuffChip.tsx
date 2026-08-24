import { type FC, useEffect, useState } from 'react';
import type { MAffectPacket } from '@shared/types';
import { resolveAffect } from './character-helpers';
import { getAffectIconUrl } from '../../../lib/affect-icons';
import { formatRemaining } from '../../../lib/format';

interface BuffChipProps {
  affect: MAffectPacket;
  /** Wall-clock at IPC arrival from the parent — projection anchor. */
  syncMs: number;
  size?: number;
}

const AFFECT_OCTET_SECONDS = 8;

const projectRemaining = (timeOctets: number, syncMs: number): number => {
  const elapsed = (Date.now() - syncMs) / 1000;
  return Math.max(0, timeOctets * AFFECT_OCTET_SECONDS - Math.floor(elapsed));
};

export const BuffChip: FC<BuffChipProps> = ({ affect, syncMs, size = 28 }) => {
  const meta = resolveAffect(affect.type);
  const isDebuff = meta.kind === 'debuff';
  const accent = isDebuff ? 'var(--color-bad)' : 'var(--color-good)';

  const [remaining, setRemaining] = useState(() => projectRemaining(affect.timeOctets, syncMs));
  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    setRemaining(projectRemaining(affect.timeOctets, syncMs));
    const id = setInterval(() => {
      setRemaining(projectRemaining(affect.timeOctets, syncMs));
    }, 1000);
    return () => clearInterval(id);
  }, [affect.timeOctets, syncMs]);

  useEffect(() => {
    setIconError(false);
  }, [affect.type]);

  if (remaining <= 0) return null;

  const iconUrl = getAffectIconUrl(affect.type);

  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-md border bg-gray-900/60 py-1 pr-2 pl-1 ${
        isDebuff ? 'border-red-400/30' : 'border-cyan-400/30'
      }`}
    >
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {iconUrl && !iconError ? (
          <img
            src={iconUrl}
            width={size}
            height={size}
            alt=""
            draggable={false}
            onError={() => setIconError(true)}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div
            className="h-full w-full rounded-sm border"
            style={{
              background: `linear-gradient(135deg, ${accent}, transparent)`,
              borderColor: accent,
              opacity: 0.55,
            }}
          />
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <div className="text-[11px] font-semibold text-gray-300">{meta.name}</div>
        <div className="font-mono text-[10px] text-gray-500">{formatRemaining(remaining)}</div>
      </div>
    </div>
  );
};

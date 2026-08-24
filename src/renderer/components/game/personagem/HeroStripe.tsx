import { type FC } from 'react';
import { CLASS_DISPLAY_NAMES, CLASS_TIERS } from '@shared/constants/character-classes';
import { StatBar } from '../../shared/StatBar';
import type { PlayerDisplayInfo } from '../../../stores/player-store';

interface HeroStripeProps {
  player: PlayerDisplayInfo;
  channel: string;
}

const initialsOf = (name: string): string =>
  name
    .split(/[-\s]+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const HeroStripe: FC<HeroStripeProps> = ({ player, channel }) => {
  const className = CLASS_DISPLAY_NAMES[player.charClass] ?? '';
  const tierName = CLASS_TIERS[player.evolutionTier] ?? '';
  const initials = initialsOf(player.name || '?');

  return (
    <section
      className="flex items-center gap-4 rounded-[10px] border border-gray-700 p-[14px]"
      style={{
        background:
          'radial-gradient(80% 100% at 0% 0%, var(--class-glow), transparent 60%), rgb(17 24 39 / 0.7)',
      }}
    >
      <div className="flex shrink-0 items-center gap-3">
        <div
          className="grid place-items-center rounded-[14px] text-[20px] leading-none font-bold text-white"
          style={{
            width: 56,
            height: 56,
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--class-hue) 60%, #000), color-mix(in srgb, var(--class-hue) 30%, #000))',
            border: '2px solid var(--class-hue)',
            boxShadow: '0 6px 20px var(--class-glow)',
          }}
        >
          {initials}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="text-[16px] font-semibold text-gray-100">{player.name || '—'}</div>
          <div
            className="text-[11px] font-semibold tracking-[0.06em] uppercase"
            style={{ color: 'var(--class-hue)' }}
          >
            {className}
            <span className="ml-1 font-medium text-gray-400">· {tierName}</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-gray-400">
            Lv {player.level} · {channel}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <StatBar
          label="HP"
          value={player.currentHp}
          max={player.maxHp}
          height={10}
          color="linear-gradient(90deg, #b91c1c, #ef4444)"
        />
        <StatBar
          label="MP"
          value={player.currentMp}
          max={player.maxMp}
          height={10}
          color="linear-gradient(90deg, #1d4ed8, #3b82f6)"
        />
        {player.mount.equipped && (
          <StatBar
            label="Montaria"
            value={player.mount.hp}
            max={player.mount.maxHp}
            height={6}
            color="linear-gradient(90deg, #047857, var(--color-mount))"
          />
        )}
      </div>
    </section>
  );
};

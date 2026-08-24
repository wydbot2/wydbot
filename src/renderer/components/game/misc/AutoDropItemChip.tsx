import { type FC, useState } from 'react';
import { getItemIconUrl } from '../../../lib/item-icons';
import { RARITY, type ItemRarity } from '../personagem/character-tables';

interface AutoDropItemChipProps {
  itemId: number;
  rarity: ItemRarity;
  size?: number;
  dim?: boolean;
}

export const AutoDropItemChip: FC<AutoDropItemChipProps> = ({
  itemId,
  rarity,
  size = 28,
  dim = false,
}) => {
  const iconUrl = getItemIconUrl(itemId);
  const ring = RARITY[rarity];
  // A 404 at wydicon:// (PNG missing/quarantined) flips to the #id fallback.
  // Keyed by URL so a new item id resets the failure automatically.
  const [failedUrl, setFailedUrl] = useState<string>();
  const showIcon = iconUrl !== undefined && failedUrl !== iconUrl;

  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-md"
      style={{
        width: size,
        height: size,
        border: `1px solid ${ring}`,
        background:
          'radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.06), transparent 60%), linear-gradient(135deg, #1f2937 0%, #0b0f17 100%)',
        opacity: dim ? 0.6 : 1,
      }}
    >
      {showIcon ? (
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-contain p-0.5"
          draggable={false}
          onError={() => setFailedUrl(iconUrl)}
        />
      ) : (
        <span className="font-mono text-[9px] text-gray-500">#{itemId}</span>
      )}
    </div>
  );
};

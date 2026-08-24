import type { FC, ReactNode } from 'react';
import { SectionCard } from '../../shared/SectionCard';
import { Switch } from '../../shared/Switch';
import { FEATURE_KIND_META, type MiscFeatureKind } from './lifecycle';

interface MiscCardProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  kind: MiscFeatureKind;
  disabled?: boolean;
  children?: ReactNode;
}

export const MiscCard: FC<MiscCardProps> = ({
  title,
  description,
  enabled,
  onToggle,
  kind,
  disabled = false,
  children,
}) => {
  const meta = FEATURE_KIND_META[kind];
  return (
    <SectionCard
      title={<span className={enabled ? 'text-gray-200' : 'text-gray-400'}>{title}</span>}
      mini={meta.mini}
      miniTooltip={meta.tooltip}
      rightSlot={
        <Switch aria-label={title} checked={enabled} onChange={onToggle} disabled={disabled} />
      }
    >
      <p className="text-xs text-gray-500">{description}</p>
      {enabled && children && (
        <div className="mt-3 border-t border-gray-700/50 pt-3">{children}</div>
      )}
    </SectionCard>
  );
};

import { type FC } from 'react';
import { SkillRotationRow, type SkillSlot } from './SkillRotationRow';

interface SkillRotationListProps {
  slots: SkillSlot[];
  /** Priority of the slot currently being cast — null when idle/empty rotation. */
  activePriority: number | null;
  onSlotClick: (priority: number) => void;
  disabled?: boolean;
}

export const SkillRotationList: FC<SkillRotationListProps> = ({
  slots,
  activePriority,
  onSlotClick,
  disabled,
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-1.5">
    {slots.map((slot) => (
      <SkillRotationRow
        key={slot.priority}
        slot={slot}
        isActive={activePriority === slot.priority}
        disabled={disabled}
        onClick={() => onSlotClick(slot.priority)}
      />
    ))}
  </div>
);

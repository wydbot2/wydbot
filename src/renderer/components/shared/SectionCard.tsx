import type { FC, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface SectionCardProps {
  title: ReactNode;
  mini?: string;
  miniTooltip?: string;
  rightSlot?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const SectionCard: FC<SectionCardProps> = ({
  title,
  mini,
  miniTooltip,
  rightSlot,
  className = '',
  children,
}) => (
  <section className={`pp-section ${className}`}>
    <div className="mb-2.5 flex items-baseline justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="pp-section-title">{title}</h3>
        {mini &&
          (miniTooltip ? (
            <Tooltip content={miniTooltip} placement="top">
              <span className="cursor-help pp-mini">{mini}</span>
            </Tooltip>
          ) : (
            <span className="pp-mini">{mini}</span>
          ))}
      </div>
      {rightSlot}
    </div>
    {children}
  </section>
);

import type { FC, ReactNode } from 'react';

interface ListPanelProps {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export const ListPanel: FC<ListPanelProps> = ({ header, children, footer, className = '' }) => (
  <div
    className={`flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800/50 ${className}`}
  >
    {header}
    {children}
    {footer && <div className="border-t border-dashed border-gray-600">{footer}</div>}
  </div>
);

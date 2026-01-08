import { ReactNode } from 'react';

interface SettingsPanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsPanel({ title, children, className = '' }: SettingsPanelProps) {
  return (
    <div className={`bg-white border-2 border-neutral rounded-lg p-6 shadow-md ${className}`}>
      {title && <h2 className="text-xl font-semibold mb-4 text-dark">{title}</h2>}
      {children}
    </div>
  );
}

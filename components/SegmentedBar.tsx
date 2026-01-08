interface SegmentedBarProps {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
  unit?: string;
  color?: 'primary' | 'secondary';
  disabled?: boolean;
  description?: string;
}

export function SegmentedBar({
  label,
  value,
  values,
  onChange,
  unit = '',
  color = 'primary',
  disabled = false,
  description,
}: SegmentedBarProps) {
  const colorClasses = {
    primary: {
      active: 'bg-primary hover:bg-primary-dark',
      text: 'text-primary',
    },
    secondary: {
      active: 'bg-secondary hover:bg-secondary-dark',
      text: 'text-secondary',
    },
  };

  const currentColor = colorClasses[color];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-semibold text-dark">{label}</label>
        <span className={`text-2xl font-bold ${currentColor.text}`}>
          {value}{unit}
        </span>
      </div>
      <div className="flex gap-1">
        {values.map((segmentValue) => (
          <button
            key={segmentValue}
            onClick={() => !disabled && onChange(segmentValue)}
            disabled={disabled}
            className={`flex-1 h-8 rounded-sm transition-all duration-200 ${
              segmentValue <= value
                ? currentColor.active
                : 'bg-neutral/30 hover:bg-neutral/50'
            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            title={`${segmentValue}${unit}`}
          />
        ))}
      </div>
      {description && (
        <p className="text-xs text-dark/60 mt-2">{description}</p>
      )}
    </div>
  );
}

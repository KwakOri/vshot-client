interface PhotoCounterProps {
  current: number;
  total: number;
}

export function PhotoCounter({ current, total }: PhotoCounterProps) {
  return (
    <div className="flex items-center justify-center mb-4">
      <div className="text-5xl font-bold text-primary">
        {current}
        <span className="text-2xl text-dark/40 mx-2">/</span>
        <span className="text-3xl text-dark/60">{total}</span>
      </div>
    </div>
  );
}

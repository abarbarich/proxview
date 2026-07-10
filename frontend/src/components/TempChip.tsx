import { tempColor } from '../lib/format';
import type { TempReading } from '../types';

export function TempChip({ reading }: { reading: TempReading }) {
  const color = tempColor(reading.value, reading.kind);
  return (
    <span className="temp-chip">
      <span className="temp-dot" style={{ background: color }} />
      <span className="temp-label">{reading.label}</span>
      <span className="temp-val" style={{ color }}>
        {Math.round(reading.value)}°
      </span>
    </span>
  );
}

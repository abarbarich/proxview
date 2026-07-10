import { loadColor } from '../lib/format';

interface Props {
  value: number; // 0..100
  label?: string;
}

export function Gauge({ value, label }: Props) {
  const r = 33;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const color = loadColor(clamped);
  return (
    <div className="gauge">
      <svg viewBox="0 0 80 80" width="82" height="82">
        <circle cx="40" cy="40" r={r} className="gauge-track" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="gauge-fill"
          style={{ stroke: color, strokeDasharray: circumference, strokeDashoffset: offset }}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-val">
          {Math.round(clamped)}
          <i>%</i>
        </span>
        {label && <span className="gauge-label">{label}</span>}
      </div>
    </div>
  );
}

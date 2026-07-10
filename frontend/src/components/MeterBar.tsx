import { formatBytes, loadColor, pct } from '../lib/format';

interface Props {
  label: string;
  used: number;
  total: number;
}

export function MeterBar({ label, used, total }: Props) {
  const percent = pct(used, total);
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          {formatBytes(used)} <span className="meter-total">/ {formatBytes(total)}</span>
        </span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{ width: `${percent}%`, background: loadColor(percent) }}
        />
      </div>
    </div>
  );
}

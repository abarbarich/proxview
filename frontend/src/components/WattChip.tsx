export function WattChip({ watts, label = 'Power' }: { watts: number; label?: string }) {
  if (!(watts > 0)) return null; // 0 W / unavailable — don't render a misleading chip
  return (
    <span className="temp-chip">
      <span className="temp-dot" style={{ background: 'var(--info-text)' }} />
      <span className="temp-label">{label}</span>
      <span className="temp-val" style={{ color: 'var(--info-text)' }}>
        {Math.round(watts)} W
      </span>
    </span>
  );
}

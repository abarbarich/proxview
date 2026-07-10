export function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'online' || status === 'running'
      ? 'ok'
      : status === 'offline'
        ? 'crit'
        : status === 'stopped'
          ? 'idle'
          : 'warn';
  return <span className={`dot ${cls}`} title={status} />;
}

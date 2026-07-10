import { useUi } from '../store/ui';

export function ColumnSelect() {
  const columns = useUi((s) => s.columns);
  const setColumns = useUi((s) => s.setColumns);
  return (
    <div className="col-select" title="Columns">
      {[2, 3, 4].map((n) => (
        <button key={n} className={columns === n ? 'active' : ''} onClick={() => setColumns(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

import { useUi, type ThemePref } from '../store/ui';

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeSelect() {
  const pref = useUi((s) => s.themePref);
  const setPref = useUi((s) => s.setThemePref);
  return (
    <div className="col-select" title="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={pref === o.value ? 'active' : ''}
          onClick={() => setPref(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

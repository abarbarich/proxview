import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useUi } from '../store/ui';

export interface ChartPoint {
  t: number; // epoch seconds
  v: number;
}

interface Props {
  label: string;
  unit: string;
  color: string; // real color (hex/rgb), not a CSS var
  points: ChartPoint[];
  yMax?: number;
  height?: number;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function toData(points: ChartPoint[]): uPlot.AlignedData {
  return [points.map((p) => p.t), points.map((p) => p.v)];
}

export function TimeChart({ label, unit, color, points, yMax, height = 190 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const theme = useUi((s) => s.theme); // re-create chart when theme flips

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const AXIS = cssVar('--chart-axis', '#5f6d82');
    const GRID = cssVar('--chart-grid', 'rgba(35,44,61,0.7)');
    const opts: uPlot.Options = {
      width: el.clientWidth || 420,
      height,
      padding: [12, 10, 0, 0],
      legend: { show: false },
      cursor: { y: false, points: { size: 6 } },
      scales: {
        x: { time: true },
        y: { range: (_u, _min, max) => [0, yMax ?? Math.max(max ?? 1, 1)] },
      },
      axes: [
        {
          stroke: AXIS,
          grid: { stroke: GRID, width: 1 },
          ticks: { stroke: GRID, width: 1 },
          font: '11px ui-monospace, monospace',
        },
        {
          stroke: AXIS,
          grid: { stroke: GRID, width: 1 },
          ticks: { stroke: GRID, width: 1 },
          font: '11px ui-monospace, monospace',
          size: 46,
          values: (_u, ticks) => ticks.map((v) => `${Math.round(v)}${unit}`),
        },
      ],
      series: [{}, { label, stroke: color, width: 2, fill: `${color}22`, points: { show: false } }],
    };
    plot.current = new uPlot(opts, toData(points), el);
    const ro = new ResizeObserver(() => {
      if (wrap.current) plot.current?.setSize({ width: wrap.current.clientWidth, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Recreated on theme change (new axis/grid colors); data flows in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    plot.current?.setData(toData(points));
  }, [points]);

  return <div className="chart" ref={wrap} />;
}

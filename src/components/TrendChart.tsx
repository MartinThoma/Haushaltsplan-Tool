import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { formatCompactEuro, formatEuro } from '../lib/format.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const SERIES_SLOTS = 8;

export interface TrendSeries {
  id: string;
  label: string;
  /** Short label drawn at the end of the line, e.g. the Gruppierungsziffer. */
  shortLabel: string;
  /** Fixed categorical slot 0–7, so a series keeps its color when others are removed. */
  slot: number;
  values: (number | null)[];
}

interface Props {
  labels: string[];
  series: TrendSeries[];
}

/** Reads the color tokens from CSS and re-reads them when the color scheme changes. */
function useTokens() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    return {
      dark,
      surface: token('--surface'),
      ink: token('--ink'),
      ink2: token('--ink-2'),
      axis: token('--axis'),
      grid: token('--line'),
      border: token('--line-strong'),
      series: Array.from({ length: SERIES_SLOTS }, (_, i) => token(`--series-${i + 1}`)),
    };
  }, [dark]);
}

type Tokens = ReturnType<typeof useTokens>;

/** Vertical hairline at the hovered year. */
function crosshair(tokens: Tokens): Plugin<'line'> {
  return {
    id: 'crosshair',
    beforeDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements();
      if (!active?.length) return;
      const { ctx, chartArea } = chart;
      const x = active[0]!.element.x;
      ctx.save();
      ctx.strokeStyle = tokens.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

const END_LABEL_GAP = 14;

/**
 * Direct labels at the line ends for 2–4 series, skipped when they would collide.
 * Reads the labels through a ref because Chart.js keeps the plugin instance it was created with.
 */
function endLabels(shortLabels: { current: string[] }, tokens: Tokens): Plugin<'line'> {
  return {
    id: 'endLabels',
    afterDatasetsDraw(chart) {
      const datasets = chart.data.datasets;
      if (datasets.length < 2 || datasets.length > 4) return;
      const points = datasets.flatMap((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        const last = (dataset.data as (number | null)[]).findLastIndex((v) => v !== null);
        const point = meta.data[last];
        return point && !meta.hidden ? [{ x: point.x, y: point.y, text: shortLabels.current[i] ?? '' }] : [];
      });
      const ys = points.map((p) => p.y).sort((a, b) => a - b);
      if (ys.some((y, i) => i > 0 && y - ys[i - 1]! < END_LABEL_GAP)) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = tokens.ink2;
      ctx.textBaseline = 'middle';
      for (const p of points) ctx.fillText(p.text, p.x + 9, p.y);
      ctx.restore();
    },
  };
}

export function TrendChart({ labels, series }: Props) {
  const tokens = useTokens();
  const shortLabels = useRef<string[]>([]);
  shortLabels.current = series.map((s) => s.shortLabel);
  const plugins = useMemo(() => [crosshair(tokens), endLabels(shortLabels, tokens)], [tokens]);

  const data: ChartData<'line', (number | null)[], string> = {
    labels,
    datasets: series.map((s) => {
      const color = tokens.series[s.slot]!;
      return {
        label: s.label,
        data: s.values,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        pointRadius: 4,
        pointHoverRadius: 5,
        pointHitRadius: 12,
        pointBackgroundColor: color,
        pointBorderColor: tokens.surface,
        pointBorderWidth: 2,
        pointHoverBorderWidth: 2,
        spanGaps: false,
      };
    }),
  };

  const directLabels = series.length >= 2 && series.length <= 4;
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { right: directLabels ? 40 : 8, top: 4 } },
    scales: {
      x: {
        grid: { display: false },
        border: { color: tokens.border },
        ticks: { color: tokens.axis, font: { size: 12 } },
      },
      y: {
        grace: '10%',
        border: { display: false },
        grid: { color: tokens.grid, lineWidth: 1 },
        ticks: {
          color: tokens.axis,
          font: { size: 12 },
          maxTicksLimit: 6,
          callback: (v) => formatCompactEuro(Number(v)),
        },
      },
    },
    plugins: {
      // The legend is rendered in HTML next to the chart.
      legend: { display: false },
      tooltip: {
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderWidth: 1,
        titleColor: tokens.ink2,
        bodyColor: tokens.ink,
        titleFont: { weight: 'normal', size: 12 },
        bodyFont: { size: 13 },
        padding: 10,
        boxPadding: 6,
        usePointStyle: true,
        itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
        callbacks: {
          title: (items) => `Haushaltsjahr ${items[0]?.label ?? ''}`,
          label: (item) => `${formatEuro(item.parsed.y)}   ${item.dataset.label}`,
          labelPointStyle: () => ({ pointStyle: 'line', rotation: 0 }),
        },
      },
    },
  };

  return (
    <div className="h-64 sm:h-72">
      {/* Remount on theme change so Chart.js picks up the new colors everywhere. */}
      <Line key={String(tokens.dark)} data={data} options={options} plugins={plugins} />
    </div>
  );
}

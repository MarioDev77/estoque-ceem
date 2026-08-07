import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const PALETTE = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#06b6d4', '#ec4899'];

export function BarChart({ labels, datasets, height = 260, horizontal = false }) {
  const data = {
    labels,
    datasets: (datasets || []).map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.backgroundColor || PALETTE[i % PALETTE.length] || '#0f766e',
      borderColor: ds.borderColor || ds.backgroundColor || '#0f766e',
      borderWidth: 1,
      borderRadius: 6,
      tension: 0.3,
    })),
  };
  const opts = {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#eef2f6' } } },
  };
  return (
    <div style={{ height }}>
      <Bar data={data} options={opts} />
    </div>
  );
}

export function LineChart({ labels, datasets, height = 260 }) {
  const data = {
    labels,
    datasets: (datasets || []).map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.borderColor || PALETTE[i % PALETTE.length],
      backgroundColor: ds.backgroundColor || (ds.borderColor || PALETTE[i % PALETTE.length]) + '33',
      fill: ds.fill ?? true,
      tension: 0.35,
      pointRadius: 3,
      borderWidth: 2,
    })),
  };
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#eef2f6' } } },
  };
  return (
    <div style={{ height }}>
      <Line data={data} options={opts} />
    </div>
  );
}

export function PieChart({ labels, data, height = 260 }) {
  const chartData = {
    labels,
    datasets: [{ data, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
  };
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
  };
  return (
    <div style={{ height }}>
      <Doughnut data={chartData} options={opts} />
    </div>
  );
}

export { PALETTE };


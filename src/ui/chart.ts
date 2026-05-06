import { Resvg } from "@resvg/resvg-js";
import type { PricePoint } from "../services/polymarket.js";
import { truncate } from "./text.js";

export type ChartDirection = "up" | "down" | "flat";

export interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
  direction?: ChartDirection;
}

const LINE_COLORS: Record<ChartDirection, string> = {
  up: "#00cc66",
  down: "#ff4444",
  flat: "#888888",
};

const BG = "#2b2d31";
const GRID = "#4e5058";
const TEXT_DIM = "#b5bac1";
const TEXT_TITLE = "#ffffff";

export function renderPriceChart(
  points: PricePoint[],
  opts: ChartOptions = {},
): Buffer | null {
  if (points.length < 2) return null;
  const svg = buildChartSvg(points, opts);
  return Buffer.from(new Resvg(svg).render().asPng());
}

function buildChartSvg(points: PricePoint[], opts: ChartOptions): string {
  const first = points[0];
  const last = points[points.length - 1];
  // Caller (renderPriceChart) guarantees points.length >= 2; this guard is for
  // type narrowing, not a runtime branch we expect to take.
  if (!first || !last) return "";

  const width = opts.width ?? 600;
  const height = opts.height ?? 300;
  const direction = opts.direction ?? "flat";
  const lineColor = LINE_COLORS[direction];

  const top = opts.title ? 36 : 16;
  const right = 56;
  const bottom = 28;
  const left = 16;
  const chartW = width - left - right;
  const chartH = height - top - bottom;

  const tMin = first.t;
  const tMax = last.t;
  const tSpan = Math.max(tMax - tMin, 1);
  const xOf = (t: number) => left + ((t - tMin) / tSpan) * chartW;
  const yOf = (p: number) => top + (1 - clamp01(p)) * chartH;

  const lastX = xOf(last.t);
  const lastY = yOf(last.p);

  const linePoints = points
    .map((pt) => `${xOf(pt.t).toFixed(1)},${yOf(pt.p).toFixed(1)}`)
    .join(" ");

  const baseline = top + chartH;
  const areaPath =
    `M ${xOf(first.t).toFixed(1)},${baseline.toFixed(1)} ` +
    points
      .map((pt) => `L ${xOf(pt.t).toFixed(1)},${yOf(pt.p).toFixed(1)}`)
      .join(" ") +
    ` L ${lastX.toFixed(1)},${baseline.toFixed(1)} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => {
      const y = yOf(p).toFixed(1);
      const labelY = (yOf(p) + 4).toFixed(1);
      return (
        `<line x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}" stroke="${GRID}" stroke-width="1" stroke-dasharray="2,3"/>` +
        `<text x="${left + chartW + 6}" y="${labelY}" fill="${TEXT_DIM}" font-size="10" font-family="sans-serif">${(p * 100).toFixed(0)}%</text>`
      );
    })
    .join("");

  const timeY = (top + chartH + 16).toFixed(1);
  const startLabel = formatDate(tMin);
  const endLabel = formatDate(tMax);

  const currentPct = `${(last.p * 100).toFixed(1)}%`;
  const labelAbove = lastY > top + 14;
  const currentLabelY = labelAbove
    ? (lastY - 6).toFixed(1)
    : (lastY + 14).toFixed(1);

  const titleSvg = opts.title
    ? `<text x="${(width / 2).toFixed(1)}" y="22" fill="${TEXT_TITLE}" font-size="14" font-weight="600" font-family="sans-serif" text-anchor="middle">${escapeSvg(truncate(opts.title, 70))}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${BG}"/>`,
    titleSvg,
    gridLines,
    `<path d="${areaPath}" fill="${lineColor}" fill-opacity="0.18"/>`,
    `<polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${lineColor}"/>`,
    `<text x="${(left + chartW + 6).toFixed(1)}" y="${currentLabelY}" fill="${lineColor}" font-size="11" font-weight="600" font-family="sans-serif">${currentPct}</text>`,
    `<text x="${left}" y="${timeY}" fill="${TEXT_DIM}" font-size="10" font-family="sans-serif">${startLabel}</text>`,
    `<text x="${(left + chartW).toFixed(1)}" y="${timeY}" fill="${TEXT_DIM}" font-size="10" font-family="sans-serif" text-anchor="end">${endLabel}</text>`,
    `</svg>`,
  ].join("");
}

function formatDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function escapeSvg(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

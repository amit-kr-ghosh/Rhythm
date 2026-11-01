import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Row, Text } from './ui';
import { WEEKDAY_SHORT } from '../domain/time';

/* Hand-built SVG charts: no chart-library dependency, theme-aware, and every chart exposes a text summary for screen readers. */

export type BarDatum = { label: string; value: number; color?: string; sub?: string };

export function BarChart({ data, height = 140, target, format = (v) => String(Math.round(v)), summary, color }: {
  data: BarDatum[]; height?: number; target?: number | null; format?: (v: number) => string; summary: string; color?: string;
}) {
  const t = useTheme();
  const [w, setW] = React.useState(300);
  const max = Math.max(1, ...data.map((d) => d.value), target ?? 0);
  const top = 18, bottom = 22, plot = height - top - bottom;
  const gap = 6, bw = Math.max(6, (w - gap * (data.length - 1)) / Math.max(1, data.length));
  return (
    <View accessible accessibilityLabel={summary} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        {target ? <Line x1={0} x2={w} y1={top + plot - (target / max) * plot} y2={top + plot - (target / max) * plot} stroke={t.colors.warning} strokeDasharray="4 5" strokeWidth={2} /> : null}
        {data.map((d, i) => {
          const h = (d.value / max) * plot, x = i * (bw + gap);
          return (
            <G key={`${d.label}-${i}`}>
              <Rect x={x} y={top + plot - h} width={bw} height={Math.max(d.value > 0 ? 2 : 0, h)} rx={Math.min(8, bw / 2)} fill={d.color ?? color ?? t.colors.accent} />
              {d.value > 0 && data.length <= 10 ? <SvgText x={x + bw / 2} y={top + plot - h - 4} fontSize={10} fill={t.colors.textMuted} textAnchor="middle">{format(d.value)}</SvgText> : null}
              {data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? <SvgText x={x + bw / 2} y={height - 6} fontSize={10} fill={t.colors.textMuted} textAnchor="middle">{d.label}</SvgText> : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export type Slice = { label: string; value: number; color: string };
export function Donut({ slices, size = 140, thickness = 22, centerLabel, centerSub, summary }: { slices: Slice[]; size?: number; thickness?: number; centerLabel?: string; centerSub?: string; summary: string }) {
  const t = useTheme();
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <View accessible accessibilityLabel={summary} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.colors.track} strokeWidth={thickness} fill="none" />
        {total > 0 ? slices.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * C;
          const el = <Circle key={s.label} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={thickness} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        }) : null}
      </Svg>
      {centerLabel ? <Text variant="heading">{centerLabel}</Text> : null}
      {centerSub ? <Text variant="caption" tone="muted">{centerSub}</Text> : null}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      {items.map((i) => (
        <Row key={i.label} between>
          <Row gap={t.spacing.sm}><View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: i.color }} /><Text variant="caption">{i.label}</Text></Row>
          {i.value ? <Text variant="caption" tone="muted">{i.value}</Text> : null}
        </Row>
      ))}
    </View>
  );
}

/** Line chart; `null` points break the line (no data ≠ zero). */
export function LineChart({ points, labels, height = 140, yMax = 100, summary, color, suffix = '%' }: { points: (number | null)[]; labels?: string[]; height?: number; yMax?: number; summary: string; color?: string; suffix?: string }) {
  const t = useTheme();
  const [w, setW] = React.useState(300);
  const left = 28, bottom = 20, top = 8, plotW = Math.max(1, w - left - 4), plotH = height - top - bottom;
  const xs = (i: number) => left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const ys = (v: number) => top + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const segs: string[] = []; let cur = '';
  points.forEach((p, i) => { if (p === null) { if (cur) segs.push(cur); cur = ''; } else cur += `${cur ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p).toFixed(1)} `; });
  if (cur) segs.push(cur);
  const c = color ?? t.colors.accent;
  return (
    <View accessible accessibilityLabel={summary} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map((f) => <G key={f}><Line x1={left} x2={w} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} stroke={t.colors.border} strokeWidth={1} /><SvgText x={0} y={top + plotH * (1 - f) + 3} fontSize={9} fill={t.colors.textFaint}>{Math.round(yMax * f)}{suffix}</SvgText></G>)}
        {segs.map((d, i) => <Path key={i} d={d} stroke={c} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />)}
        {points.map((p, i) => (p === null ? null : <Circle key={i} cx={xs(i)} cy={ys(p)} r={4} fill={t.colors.surface} stroke={c} strokeWidth={2.5} />))}
        {labels ? labels.map((l, i) => (labels.length <= 8 || i % Math.ceil(labels.length / 6) === 0 ? <SvgText key={i} x={xs(i)} y={height - 4} fontSize={9} fill={t.colors.textMuted} textAnchor="middle">{l}</SvgText> : null)) : null}
      </Svg>
    </View>
  );
}

/** GitHub-style calendar heatmap. Columns are weeks, rows are weekdays starting at `weekStart`. */
export function Heatmap({ cells, weekStart = 1, summary }: { cells: { date: string; level: 0 | 1 | 2 | 3 | 4; min: number }[]; weekStart?: 0 | 1 | 6; summary: string }) {
  const t = useTheme();
  const [w, setW] = React.useState(300);
  if (cells.length === 0) return null;
  const dow = (d: string) => { const [y, m, dd] = d.split('-').map(Number) as [number, number, number]; return new Date(y, m - 1, dd).getDay(); };
  const row = (d: string) => (dow(d) - weekStart + 7) % 7;
  const lead = row(cells[0]!.date);
  const cols = Math.ceil((cells.length + lead) / 7);
  const gap = 3, size = Math.max(8, Math.min(20, (w - 20 - gap * (cols - 1)) / cols));
  return (
    <View accessible accessibilityLabel={summary} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={7 * (size + gap) + 4}>
        {[0, 2, 4, 6].map((r) => <SvgText key={r} x={0} y={r * (size + gap) + size - 2} fontSize={9} fill={t.colors.textFaint}>{(WEEKDAY_SHORT[(r + weekStart) % 7] as string).slice(0, 1)}</SvgText>)}
        {cells.map((c, i) => {
          const idx = i + lead, col = Math.floor(idx / 7), r = idx % 7;
          return <Rect key={c.date} x={16 + col * (size + gap)} y={r * (size + gap)} width={size} height={size} rx={4} fill={t.colors.heat[c.level]} />;
        })}
      </Svg>
      <Row gap={t.spacing.xs} style={{ marginTop: t.spacing.xs }}>
        <Text variant="caption" tone="muted">Less</Text>
        {t.colors.heat.map((h, i) => <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: h }} />)}
        <Text variant="caption" tone="muted">More</Text>
      </Row>
    </View>
  );
}

/** Horizontal bars for labelled values (subject distribution, hour-of-day etc.). */
export function HBars({ rows, format }: { rows: { label: string; value: number; color: string; sub?: string }[]; format: (v: number) => string }) {
  const t = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: t.spacing.md }}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={`${r.label}: ${format(r.value)}${r.sub ? `, ${r.sub}` : ''}`} style={{ gap: 4 }}>
          <Row between><Text variant="caption">{r.label}</Text><Text variant="caption" tone="muted">{format(r.value)}{r.sub ? ` · ${r.sub}` : ''}</Text></Row>
          <View style={{ height: 12, borderRadius: 6, backgroundColor: t.colors.track, overflow: 'hidden' }}><View style={{ width: `${(r.value / max) * 100}%`, height: '100%', backgroundColor: r.color, borderRadius: 6 }} /></View>
        </View>
      ))}
    </View>
  );
}

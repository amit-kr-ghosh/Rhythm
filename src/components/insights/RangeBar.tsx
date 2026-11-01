import React from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Chip, Row, Text } from '../ui';
import { DateStepper } from '../tasks/DateStepper';
import { useActiveSubjects } from '../../state/hooks';
import { RANGE_OPTIONS, formatDateShort, type RangeKey } from '../../state/extra-insights';
import type { Range } from '../../domain/analytics';
import type { DateKey } from '../../domain/types';

export function RangeBar({ rangeKey, onRangeKey, custom, onCustom, subjectId, onSubject, range, today }: {
  rangeKey: RangeKey; onRangeKey: (k: RangeKey) => void; custom: Range; onCustom: (r: Range) => void;
  subjectId: string | null; onSubject: (id: string | null) => void; range: Range; today: DateKey;
}) {
  const t = useTheme();
  const subjects = useActiveSubjects();
  return (
    <View style={{ gap: t.spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }} accessibilityLabel="Date range">
        {RANGE_OPTIONS.map((o) => <Chip key={o.value} label={o.label} selected={rangeKey === o.value} onPress={() => onRangeKey(o.value)} />)}
      </ScrollView>
      {rangeKey === 'custom' ? (
        <View style={{ gap: t.spacing.md }}>
          <DateStepper label="From" value={custom.from} base={today} onChange={(v) => v && onCustom({ from: v, to: v > custom.to ? v : custom.to })} />
          <DateStepper label="To" value={custom.to} base={today} onChange={(v) => v && onCustom({ from: v < custom.from ? v : custom.from, to: v })} />
        </View>
      ) : null}
      <Text variant="caption" tone="muted">{formatDateShort(range.from)} – {formatDateShort(range.to)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }} accessibilityLabel="Subject filter">
        <Chip label="All subjects" selected={subjectId === null} onPress={() => onSubject(null)} />
        {subjects.map((s) => <Chip key={s.id} label={s.name} color={s.color} selected={subjectId === s.id} onPress={() => onSubject(s.id)} />)}
      </ScrollView>
    </View>
  );
}

/** Small labelled row used for the "view as table" alternative. */
export function TableRow({ cells, header }: { cells: string[]; header?: boolean }) {
  const t = useTheme();
  return (
    <Row style={{ paddingVertical: t.spacing.xs, borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
      {cells.map((c, i) => <View key={i} style={{ flex: 1 }}><Text variant={header ? 'label' : 'caption'} tone={header ? 'muted' : 'default'}>{c}</Text></View>)}
    </Row>
  );
}

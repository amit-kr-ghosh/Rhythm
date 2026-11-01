import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Text, IconButton, Row, focusRing } from '../ui';
import { WEEKDAY_SHORT, parseDateKey, weekDates, weekdayOf } from '../../domain/time';
import type { DateKey } from '../../domain/types';

/** Seven tappable day pills for the week around `date`. The arrows step ONE day (Sunday → Monday rolls into the next week). */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function WeekStrip({ date, today, weekStart, onPick, onShift }: { date: DateKey; today: DateKey; weekStart: 0 | 1 | 6; onPick: (d: DateKey) => void; onShift: (dir: number) => void }) {
  const t = useTheme();
  const days = weekDates(date, weekStart);
  const narrow = useWindowDimensions().width < 460;
  const dot = narrow ? 28 : 34;
  const strip = (
      <View accessibilityRole="tablist" style={{ flex: 1, flexDirection: 'row', gap: narrow ? 4 : 6, minWidth: 0 }}>
        {days.map((d) => {
          const sel = d === date, isToday = d === today;
          return (
            <Pressable key={d} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={`${WEEKDAY_SHORT[weekdayOf(d)]} ${parseDateKey(d).d}${isToday ? ', today' : ''}`} onPress={() => onPick(d)}
              style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ flex: 1, minHeight: narrow ? 74 : 84, borderRadius: narrow ? 20 : 26, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: sel ? t.colors.ink : t.colors.surface, borderWidth: t.isDark && !sel ? 1 : 0, borderColor: t.colors.border, opacity: s.pressed ? 0.85 : 1 }, sel ? {} : { shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: t.isDark ? 0 : 0.07, shadowRadius: 14, elevation: 2 }, focusRing(t, s.focused)]}>
              <Text variant="caption" style={{ color: sel ? t.colors.onInk : t.colors.textMuted, fontWeight: '600', fontSize: narrow ? 10 : 12 }} numberOfLines={1}>{(WEEKDAY_SHORT[weekdayOf(d)] as string).slice(0, narrow ? 2 : 3)}</Text>
              <View style={{ width: dot, height: dot, borderRadius: dot / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.colors.surface : isToday ? t.colors.accentSoft : t.colors.surfaceSunken }}>
                <Text variant="bodyStrong" style={{ color: sel ? t.colors.ink : isToday ? t.colors.accent : t.colors.text, fontSize: narrow ? 13 : 15 }}>{parseDateKey(d).d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
  );
  // Narrow phones: week arrows above the strip so all seven days get the full width.
  if (narrow) {
    return (
      <View style={{ gap: t.spacing.sm }}>
        <Row between>
          <IconButton icon="chevron-back" label="Previous day" onPress={() => onShift(-1)} />
          <Text variant="label" tone="muted">{MONTHS[parseDateKey(date).m - 1]} {parseDateKey(date).y}</Text>
          <IconButton icon="chevron-forward" label="Next day" onPress={() => onShift(1)} />
        </Row>
        {strip}
      </View>
    );
  }
  return (
    <Row gap={t.spacing.xs}>
      <IconButton icon="chevron-back" label="Previous day" onPress={() => onShift(-1)} />
      {strip}
      <IconButton icon="chevron-forward" label="Next day" onPress={() => onShift(1)} />
    </Row>
  );
}

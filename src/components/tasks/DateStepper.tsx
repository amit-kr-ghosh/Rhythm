import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, IconButton, Row, Text } from '../ui';
import { addDays } from '../../domain/time';
import type { DateKey } from '../../domain/types';
import { formatDateLong } from '../../state/extra-insights';

/** Accessible date input: ±1 day / ±1 week steppers around a readable date. `null` = "no date". */
export function DateStepper({ label, value, onChange, base, allowClear = false, error }: {
  label: string; value: DateKey | null; onChange: (v: DateKey | null) => void; base: DateKey; allowClear?: boolean; error?: string;
}) {
  const t = useTheme();
  const cur = value ?? base;
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="label" tone="muted">{label}</Text>
      {value === null ? (
        <Button label="Set a date" variant="secondary" icon="calendar-outline" onPress={() => onChange(base)} />
      ) : (
        <Row gap={t.spacing.xs}>
          <IconButton icon="play-back" label={`${label}: back one week`} onPress={() => onChange(addDays(cur, -7))} />
          <IconButton icon="remove" label={`${label}: back one day`} onPress={() => onChange(addDays(cur, -1))} />
          <View style={{ flex: 1, alignItems: 'center' }}><Text variant="bodyStrong" align="center" accessibilityRole="text">{formatDateLong(cur)}</Text></View>
          <IconButton icon="add" label={`${label}: forward one day`} onPress={() => onChange(addDays(cur, 1))} />
          <IconButton icon="play-forward" label={`${label}: forward one week`} onPress={() => onChange(addDays(cur, 7))} />
        </Row>
      )}
      {allowClear && value !== null ? <Button label="Remove date" variant="ghost" compact onPress={() => onChange(null)} /> : null}
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}

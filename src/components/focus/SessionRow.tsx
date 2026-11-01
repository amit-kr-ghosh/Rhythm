import React from 'react';
import { View } from 'react-native';
import { Card, Row, Text } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { formatClock, minutesOfDay } from '../../domain/time';
import { minLabel, modeLabel } from '../../state/extra-focus';
import type { StudySession, Subject } from '../../domain/types';

/** One recorded session. Tapping opens the detail screen. */
export function SessionRow({ session, subject, onPress, showDate }: { session: StudySession; subject?: Subject; onPress: () => void; showDate?: boolean }) {
  const t = useTheme();
  const start = formatClock(minutesOfDay(new Date(session.startedAt)));
  const end = formatClock(minutesOfDay(new Date(session.endedAt)));
  const name = subject?.name ?? 'No subject';
  const mins = minLabel(session.focusSec / 60);
  const cancelled = session.status === 'cancelled';
  return (
    <Card onPress={onPress} accessibilityLabel={`${name}, ${mins} focused, ${start} to ${end}${cancelled ? ', cancelled' : ''}`} style={{ padding: t.spacing.lg, borderRadius: t.radius.xl }}>
      <Row between>
        <Row style={{ flex: 1 }} gap={t.spacing.md}>
          <View style={{ width: 8, height: 40, borderRadius: 4, backgroundColor: subject?.color ?? t.colors.textFaint }} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{name}</Text>
            <Text variant="caption" tone="muted">{showDate ? `${session.date} · ` : ''}{start}–{end} · {modeLabel(session.mode)}{session.source === 'manual' ? ' · manual' : ''}</Text>
          </View>
        </Row>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong" tone={cancelled ? 'faint' : 'default'}>{mins}</Text>
          {cancelled ? <Text variant="caption" tone="warning">Cancelled</Text> : null}
        </View>
      </Row>
    </Card>
  );
}

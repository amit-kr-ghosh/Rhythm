import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { useApp } from '../../state/store';
import { setTaskStatus } from '../../state/actions';
import { isOverdue, taskDoneOn } from '../../domain/progress';
import { formatDateShort } from '../../state/extra-insights';
import { minLabel } from '../../state/extra-focus';
import { Check, Pill, Row, Text, focusRing } from '../ui';
import type { Task } from '../../domain/types';

/** One task: animated checkbox, title, and small pills for priority, subject, date and estimate. Tap the title to edit. */
export function TaskItem({ task, today, last }: { task: Task; today: string; last?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const subjects = useApp((s) => s.data.subjects);
  const done = taskDoneOn(task, today);
  const subject = subjects.find((s) => s.id === task.subjectId);
  const overdue = isOverdue(task, today);
  const prio = task.priority === 'high' ? t.colors.danger : task.priority === 'medium' ? t.colors.warning : t.colors.textMuted;
  return (
    <Row gap={t.spacing.xs} style={{ minHeight: 64, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.colors.border }}>
      <Check checked={done} label={`${task.title}, ${done ? 'completed' : 'not completed'}`} onPress={() => void setTaskStatus(task.id, done ? 'todo' : 'done', today)} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={() => router.push(`/task/${task.id}` as never)}
        style={(s: { pressed: boolean; focused?: boolean }) => [{ flex: 1, minHeight: t.minTouch, justifyContent: 'center', paddingVertical: t.spacing.sm, borderRadius: t.radius.md }, focusRing(t, s.focused)]}>
        <Text variant="bodyStrong" numberOfLines={2} style={{ textDecorationLine: done ? 'line-through' : 'none' }} tone={done ? 'muted' : 'default'}>{task.title}</Text>
        <Row gap={t.spacing.xs} wrap style={{ marginTop: 4 }}>
          {task.priority !== 'low' ? <Pill label={task.priority === 'high' ? 'High' : 'Medium'} color={prio} /> : null}
          {subject ? <Pill label={subject.name} color={subject.color} /> : null}
          {task.dueDate ? <Pill label={`${overdue ? 'Overdue · ' : ''}${formatDateShort(task.dueDate)}`} color={overdue ? t.colors.danger : t.colors.textMuted} icon="calendar-outline" /> : null}
          {task.recurrence ? <Pill label="Repeats" icon="repeat" /> : null}
          {task.estimateMin ? <Pill label={minLabel(task.estimateMin)} icon="time-outline" /> : null}
        </Row>
      </Pressable>
    </Row>
  );
}

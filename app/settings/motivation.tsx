import React from 'react';
import { useApp } from '../../src/state/store';
import { updatePrefs } from '../../src/state/actions';
import { Card, Row, Text, Chip } from '../../src/components/ui';
import { SwitchRow, TimeField } from '../../src/components/inputs';
import { Pad, SubScreen } from '../../src/components/settings/parts';
import { useTheme } from '../../src/theme/ThemeProvider';
import { TOPICS } from '../../src/domain/quotes';

export default function MotivationSettings() {
  const t = useTheme();
  const m = useApp((s) => s.data.prefs.motivation);
  const patch = (p: Partial<typeof m>) => { void updatePrefs({ motivation: { ...m, ...p } }); };
  const toggleTopic = (topic: string) => patch({ topics: m.topics.includes(topic) ? m.topics.filter((x) => x !== topic) : [...m.topics, topic] });
  return (
    <SubScreen title="Motivation">
      <Card><Pad>
        <SwitchRow label="Quote of the day" hint="Shown on the Today screen." value={m.quoteOfDay} onChange={(v) => patch({ quoteOfDay: v })} />
        <SwitchRow label="Encouragement" hint="Short, supportive messages after sessions and when you’re behind." value={m.encouragement} onChange={(v) => patch({ encouragement: v })} />
        <SwitchRow label="Daily quote reminder" hint="A notification with the day’s quote. Needs notifications enabled." value={m.dailyReminder} onChange={(v) => patch({ dailyReminder: v })} />
        {m.dailyReminder ? <TimeField label="Reminder time" value={m.reminderMin} onChange={(v) => patch({ reminderMin: v })} /> : null}
      </Pad></Card>
      <Card><Pad>
        <Text variant="heading">Quote topics</Text>
        <Text variant="caption" tone="muted">Pick the themes you like. Leave all unselected to see every topic.</Text>
        <Row gap={t.spacing.sm} wrap>
          {TOPICS.map((tp) => <Chip key={tp} label={tp.charAt(0).toUpperCase() + tp.slice(1)} selected={m.topics.includes(tp)} onPress={() => toggleTopic(tp)} />)}
        </Row>
      </Pad></Card>
    </SubScreen>
  );
}

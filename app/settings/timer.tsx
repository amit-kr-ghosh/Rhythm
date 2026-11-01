import React, { useState } from 'react';
import { useApp } from '../../src/state/store';
import { updatePrefs } from '../../src/state/actions';
import { Button, Card, IconButton, Row, Text } from '../../src/components/ui';
import { DurationStepper, Field, Segmented, SwitchRow } from '../../src/components/inputs';
import { Pad, SubScreen } from '../../src/components/settings/parts';
import type { SessionMode } from '../../src/domain/types';
import { selectableMode } from '../../src/domain/timer';

export default function TimerSettings() {
  const timer = useApp((s) => s.data.prefs.timer);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [pf, setPf] = useState(30);
  const [pb, setPb] = useState(5);

  const patch = async (p: Partial<typeof timer>) => {
    const res = await updatePrefs({ timer: { ...timer, ...p } });
    setErrors(res.ok ? {} : res.errors);
  };
  const addPreset = async () => {
    const n = name.trim();
    if (!n) { setErrors({ preset: 'Name the preset.' }); return; }
    await patch({ presets: [...timer.presets, { name: n, focusMin: pf, breakMin: pb }] });
    setName('');
  };
  return (
    <SubScreen title="Focus timer">
      <Card><Pad>
        <Text variant="heading">Defaults</Text>
        <Segmented<SessionMode> label="Default mode" value={selectableMode(timer.mode)} onChange={(v) => { void patch({ mode: v }); }}
          options={[{ value: 'stopwatch', label: 'Stopwatch' }, { value: 'pomodoro', label: 'Pomodoro' }]} />
        <DurationStepper label="Focus length" value={timer.focusMin} min={1} max={300} step={5} onChange={(v) => { void patch({ focusMin: v }); }} error={errors.focus} />
        <DurationStepper label="Break length" value={timer.breakMin} min={1} max={60} step={1} onChange={(v) => { void patch({ breakMin: v }); }} error={errors.break} />
        <SwitchRow label="Break reminders" hint="A notification when a Pomodoro focus block ends. Needs notifications enabled." value={timer.breakReminders} onChange={(v) => { void patch({ breakReminders: v }); }} />
      </Pad></Card>
      <Card><Pad>
        <Text variant="heading">Presets</Text>
        {timer.presets.length === 0 ? <Text tone="muted">No presets. Add one below.</Text> : null}
        {timer.presets.map((p, i) => (
          <Row key={`${p.name}-${i}`} between>
            <Text>{p.name} · {p.focusMin}/{p.breakMin} min</Text>
            <IconButton icon="trash-outline" tone="danger" label={`Remove preset ${p.name}`} onPress={() => { void patch({ presets: timer.presets.filter((_, j) => j !== i) }); }} />
          </Row>
        ))}
        <Field label="New preset name" value={name} onChangeText={setName} error={errors.preset} maxLength={30} />
        <DurationStepper label="Preset focus" value={pf} min={1} max={300} onChange={setPf} />
        <DurationStepper label="Preset break" value={pb} min={1} max={60} step={1} onChange={setPb} />
        <Button label="Add preset" variant="secondary" icon="add" onPress={() => { void addPreset(); }} />
      </Pad></Card>
    </SubScreen>
  );
}

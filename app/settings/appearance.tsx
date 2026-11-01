import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useApp } from '../../src/state/store';
import { updatePrefs } from '../../src/state/actions';
import { Card, Row, Text } from '../../src/components/ui';
import { Segmented } from '../../src/components/inputs';
import { SubScreen, Pad } from '../../src/components/settings/parts';
import { palettes, type ThemeName, type ThemePreference } from '../../src/theme/tokens';

function Preview({ name }: { name: ThemeName }) {
  const t = useTheme();
  const p = palettes[name];
  return (
    <View accessible accessibilityLabel={`${name} theme preview`} style={{ flex: 1, backgroundColor: p.bg, borderRadius: t.radius.lg, borderWidth: 1, borderColor: p.border, padding: t.spacing.md, gap: t.spacing.sm }}>
      <Text variant="label" style={{ color: p.textMuted }}>{name[0]!.toUpperCase() + name.slice(1)}</Text>
      <View style={{ backgroundColor: p.surface, borderRadius: t.radius.md, padding: t.spacing.sm, borderWidth: 1, borderColor: p.border, gap: 6 }}>
        <Text variant="bodyStrong" style={{ color: p.text }}>Today 72%</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.track }}><View style={{ width: '72%', height: 6, borderRadius: 3, backgroundColor: p.accent }} /></View>
      </View>
      <Row gap={t.spacing.xs}>
        {[p.accent, p.success, p.warning, p.danger].map((c, i) => <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c }} />)}
      </Row>
    </View>
  );
}

export default function Appearance() {
  const t = useTheme();
  const pref = useApp((s) => s.data.prefs.theme);
  const synced = useApp((s) => s.auth !== null);
  return (
    <SubScreen title="Appearance">
      <Card>
        <Pad>
          <Segmented<ThemePreference> label="Theme" value={pref} onChange={(v) => { void updatePrefs({ theme: v }); }}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          <Text variant="caption" tone="muted">
            {pref === 'system' ? 'Follows your phone’s setting.' : `Always ${pref}.`} Changes apply instantly{synced ? ' and sync to your account.' : '.'} Dark is the default.
          </Text>
        </Pad>
      </Card>
      <Row align="stretch" gap={t.spacing.md}><Preview name="dark" /><Preview name="light" /></Row>
    </SubScreen>
  );
}

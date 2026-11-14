import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { Chip, Row, Text, IconButton, focusRing } from './ui';
import { Sheet } from './feedback';
import { formatClock, parseClock, WEEKDAY_SHORT } from '../domain/time';
import { PICKER_COLORS } from '../domain/colors';
import { SUBJECT_ICONS } from '../domain/subjectIcons';
import { useToggleAnim } from './motion';

export function Field({ label, value, onChangeText, error, hint, placeholder, multiline, keyboardType, secure, autoCapitalize, maxLength, editable = true, onSubmitEditing, returnKeyType }: {
  label: string; value: string; onChangeText: (v: string) => void; error?: string; hint?: string; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'number-pad'; secure?: boolean; autoCapitalize?: 'none' | 'sentences' | 'words'; maxLength?: number; editable?: boolean;
  onSubmitEditing?: () => void; returnKeyType?: 'done' | 'next' | 'go';
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="bodyStrong" style={{ marginLeft: t.spacing.xs, fontWeight: '500' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.colors.textFaint}
        multiline={multiline} keyboardType={keyboardType} secureTextEntry={secure} autoCapitalize={autoCapitalize ?? 'sentences'} maxLength={maxLength} editable={editable}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType}
        style={[t.type.body, { color: t.colors.text, backgroundColor: t.colors.surface, borderRadius: t.radius.lg, borderWidth: error || focus || t.isDark ? 1.5 : 0, borderColor: error ? t.colors.danger : focus ? t.colors.focusRing : t.colors.border, paddingHorizontal: t.spacing.xl, paddingVertical: t.spacing.md, minHeight: multiline ? 112 : 58, textAlignVertical: multiline ? 'top' : 'center', opacity: editable ? 1 : 0.6, shadowColor: focus ? t.colors.accent : 'transparent', shadowOffset: { width: 0, height: 0 }, shadowOpacity: focus ? 0.16 : 0, shadowRadius: 8, elevation: focus ? 1 : 0 }]}
      />
      {error ? <Text variant="caption" tone="danger" accessibilityRole="text">{error}</Text> : hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
    </View>
  );
}

/** Whole-number field returning number | null. Empty string → null. */
export function NumberField({ label, value, onChange, error, hint, suffix, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; error?: string; hint?: string; suffix?: string; placeholder?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => { setText(value === null ? '' : String(value)); }, [value]);
  return (
    <Field label={suffix ? `${label} (${suffix})` : label} value={text} keyboardType="number-pad" placeholder={placeholder} error={error} hint={hint}
      onChangeText={(v) => { const clean = v.replace(/[^0-9]/g, ''); setText(clean); onChange(clean === '' ? null : parseInt(clean, 10)); }} />
  );
}

export function SwitchRow({ label, value, onChange, hint, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} accessibilityLabel={label} onPress={() => !disabled && onChange(!value)}
      style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: t.colors.track, true: t.colors.ink }} thumbColor={value ? t.colors.lime : t.colors.surface} />
    </Pressable>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label?: string }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = w > 0 ? (w - 8) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    const to = idx * segW;
    if (first.current || t.reduceMotion || segW === 0) { x.setValue(to); first.current = segW === 0; return; }
    Animated.spring(x, { toValue: to, speed: 22, bounciness: 6, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [idx, segW, t.reduceMotion, x]);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', backgroundColor: t.colors.surface, borderRadius: t.radius.pill, borderWidth: t.isDark ? 1 : 0, borderColor: t.colors.border, padding: 4, shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: t.isDark ? 0 : 0.08, shadowRadius: 16, elevation: 2 }}>
      {segW > 0 ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: segW, borderRadius: t.radius.pill, backgroundColor: t.colors.ink, transform: [{ translateX: x }] }} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.count !== undefined ? `${o.label}, ${o.count}` : o.label} onPress={() => onChange(o.value)}
            style={(s: { focused?: boolean; hovered?: boolean }) => [{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderRadius: t.radius.pill, backgroundColor: !on && s.hovered ? t.colors.surfaceSunken : 'transparent' }, focusRing(t, s.focused)]}>
            <Text variant="label" fit numberOfLines={1} style={{ color: on ? t.colors.onInk : t.colors.textMuted, fontWeight: on ? '700' : '600' }}>{o.label}</Text>
            {o.count !== undefined ? <Text variant="caption" style={{ color: on ? t.colors.lime : t.colors.textFaint, fontWeight: '700' }}>{o.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Accessible time input: steppers (+/− 5 min) plus a typed field that accepts "7:30", "7.30 pm", "1930".
 * Avoids native picker dependencies and works well with TalkBack.
 */
export function TimeField({ label, value, onChange, error, use24h = false, step = 5 }: { label: string; value: number; onChange: (min: number) => void; error?: string; use24h?: boolean; step?: number }) {
  const t = useTheme();
  const [text, setText] = useState(formatClock(value, use24h));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(formatClock(value, use24h)); }, [value, use24h, focus]);
  const bump = (d: number) => onChange(((value + d) % 1440 + 1440) % 1440);
  const commit = () => { const m = parseClock(text); if (m !== null) onChange(m); setText(formatClock(m ?? value, use24h)); setFocus(false); };
  return (
    <View style={{ gap: t.spacing.xs, flex: 1 }}>
      <Text variant="label" tone="muted">{label}</Text>
      <Row gap={t.spacing.xs}>
        <IconButton icon="remove" label={`${label} earlier by ${step} minutes`} onPress={() => bump(-step)} />
        <TextInput accessibilityLabel={label} value={text} onChangeText={setText} onFocus={() => setFocus(true)} onBlur={commit} onSubmitEditing={commit} autoCapitalize="none"
          style={[t.type.mono, { flex: 1, textAlign: 'center', color: t.colors.text, backgroundColor: t.colors.surface, borderRadius: t.radius.lg, borderWidth: 1.5, borderColor: error ? t.colors.danger : focus ? t.colors.focusRing : t.colors.border, minHeight: t.minTouch, minWidth: 96 }]} />
        <IconButton icon="add" label={`${label} later by ${step} minutes`} onPress={() => bump(step)} />
      </Row>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}

/** Minute stepper for durations. */
export function DurationStepper({ label, value, onChange, min = 1, max = 960, step = 5, error }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; error?: string }) {
  const t = useTheme();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="label" tone="muted">{label}</Text>
      <Row gap={t.spacing.xs}>
        <IconButton icon="remove" label={`Decrease ${label}`} onPress={() => onChange(clamp(value - step))} />
        <View style={{ flex: 1, alignItems: 'center' }}><Text variant="mono" accessibilityRole="text">{value} min</Text></View>
        <IconButton icon="add" label={`Increase ${label}`} onPress={() => onChange(clamp(value + step))} />
      </Row>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}

/** `order` lets the week start on the user's chosen day. */
export function WeekdayPicker({ value, onChange, weekStart = 1, error }: { value: number[]; onChange: (v: number[]) => void; weekStart?: 0 | 1 | 6; error?: string }) {
  const t = useTheme();
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStart) % 7);
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Row gap={t.spacing.xs} wrap>
        {order.map((d) => <Chip key={d} label={WEEKDAY_SHORT[d] as string} selected={value.includes(d)} onPress={() => toggle(d)} />)}
      </Row>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  const t = useTheme();
  return (
    <Row gap={t.spacing.sm} wrap>
      {PICKER_COLORS.map((c) => (
        <Pressable key={c} accessibilityRole="radio" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: value === c }} onPress={() => onChange(c)}
          style={{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: value === c ? 3 : 0, borderColor: t.colors.text, alignItems: 'center', justifyContent: 'center' }}>
            {value === c ? <Ionicons name="checkmark" size={18} color={t.colors.bg} /> : null}
          </View>
        </Pressable>
      ))}
    </Row>
  );
}

/* ---------------- Select (dropdown) ---------------- */

export type SelectOption<T> = { value: T; label: string; color?: string; hint?: string };

/**
 * Dropdown-style picker: a field showing the current choice with a chevron; tapping opens a sheet with a roomy list
 * (colour dot, name, optional hint, check on the selected row). Replaces rows of pill buttons for longer lists.
 */
/** Pick one of the subject icons, drawn in the subject's own colour. */
export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (icon: string) => void }) {
  const t = useTheme();
  return (
    <Row gap={t.spacing.sm} wrap>
      {SUBJECT_ICONS.map((name) => {
        const on = value === name;
        return (
          <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`Icon ${name.replace(/-outline$/, '').replace(/-/g, ' ')}`} accessibilityState={{ selected: on }} onPress={() => onChange(name)}
            style={{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color : t.colors.track, borderWidth: on ? 0 : 1, borderColor: t.colors.border }}>
              <Ionicons name={name as never} size={20} color={on ? t.colors.bg : t.colors.textMuted} />
            </View>
          </Pressable>
        );
      })}
    </Row>
  );
}

export function Select<T extends string | number | null>({ label, value, options, onChange, placeholder = 'Select', sheetTitle }: {
  label?: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; placeholder?: string; sheetTitle?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const chevron = useToggleAnim(open, 20);
  const current = options.find((o) => o.value === value);
  const choose = (v: T) => { setOpen(false); if (v !== value) onChange(v); };
  return (
    <View style={{ gap: t.spacing.xs }}>
      {label ? <Text variant="bodyStrong" style={{ marginLeft: t.spacing.xs, fontWeight: '500' }}>{label}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? 'Select'}: ${current?.label ?? placeholder}`} accessibilityHint="Opens a list of choices" onPress={() => setOpen(true)}
        style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.xl, borderRadius: t.radius.lg, backgroundColor: t.colors.surface, borderWidth: t.isDark ? 1.5 : 0, borderColor: t.colors.border, opacity: s.pressed ? 0.85 : 1, shadowColor: t.colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: t.isDark ? 0 : 0.07, shadowRadius: 14, elevation: 2 }, focusRing(t, s.focused)]}>
        {current?.color ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: current.color }} /> : null}
        <Text variant="bodyStrong" numberOfLines={1} tone={current ? 'default' : 'muted'} style={{ flex: 1 }}>{current?.label ?? placeholder}</Text>
        <Animated.View style={{ transform: [{ rotate: chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <Ionicons name="chevron-down" size={20} color={t.colors.textMuted} />
        </Animated.View>
      </Pressable>
      <Sheet visible={open} title={sheetTitle ?? label ?? 'Select'} onClose={() => setOpen(false)}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label} onPress={() => choose(o.value)}
              style={(s: { pressed: boolean; focused?: boolean; hovered?: boolean }) => [{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.lg, backgroundColor: on ? t.colors.accentSoft : s.pressed || s.hovered ? t.colors.surfaceSunken : 'transparent' }, focusRing(t, s.focused)]}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: o.color ?? t.colors.borderStrong }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{o.label}</Text>
                {o.hint ? <Text variant="caption" tone="muted" numberOfLines={1}>{o.hint}</Text> : null}
              </View>
              <View style={{ width: 24, height: 24 }}>{on ? <Ionicons name="checkmark-circle" size={24} color={t.colors.accent} /> : null}</View>
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

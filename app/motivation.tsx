import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { Button, Card, Chip, EmptyState, IconButton, Row, Screen, SectionHeader, Text } from '../src/components/ui';
import { Field } from '../src/components/inputs';
import { confirm } from '../src/components/feedback';
import { QuoteCard } from '../src/components/motivation/QuoteCard';
import { useApp } from '../src/state/store';
import { useToday } from '../src/state/hooks';
import { deleteAffirmation, saveAffirmation, toggleSavedQuote, updatePrefs } from '../src/state/actions';
import { QUOTES, TOPICS, quoteById, quoteOfDay, type QuoteTopic } from '../src/domain/quotes';

export default function Motivation() {
  const t = useTheme();
  const today = useToday();
  const prefs = useApp((s) => s.data.prefs);
  const saved = useApp((s) => s.data.savedQuotes);
  const affirmations = useApp((s) => s.data.affirmations);
  const [topic, setTopic] = useState<QuoteTopic | 'all'>('all');
  const [why, setWhy] = useState('');
  const [aff, setAff] = useState('');
  const [affError, setAffError] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);

  const isSaved = (id: string) => saved.some((s) => s.quoteId === id);
  const favourites = saved.map((s) => quoteById(s.quoteId)).filter((q): q is NonNullable<typeof q> => !!q);
  const list = QUOTES.filter((q) => topic === 'all' || q.topic === topic);
  const qod = quoteOfDay(today, prefs.motivation.topics as QuoteTopic[]);

  const addWhy = async () => { const w = why.trim(); if (!w) return; await updatePrefs({ whys: [...prefs.whys, w] }); setWhy(''); };
  const removeWhy = async (i: number) => { await updatePrefs({ whys: prefs.whys.filter((_, k) => k !== i) }); };
  const submitAff = async () => {
    const r = await saveAffirmation(aff, editing ?? undefined);
    if (r.ok) { setAff(''); setEditing(null); setAffError(undefined); } else setAffError(r.errors.text);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Motivation' }} />
      <Text variant="title" accessibilityRole="header">Motivation</Text>

      <SectionHeader title="Quote of the day" />
      <QuoteCard quote={qod} saved={isSaved(qod.id)} onToggleSave={() => { void toggleSavedQuote(qod.id); }} />

      <SectionHeader title="Why I’m studying" />
      <Card style={{ gap: t.spacing.md }}>
        {prefs.whys.length === 0 ? <Text variant="caption" tone="muted">Write down what this effort is for. It will be here on the hard days.</Text> : null}
        {prefs.whys.map((w, i) => (
          <Row key={`${i}-${w}`} between>
            <View style={{ flex: 1 }}><Text>{w}</Text></View>
            <IconButton icon="trash-outline" label={`Remove reason: ${w}`} tone="danger" onPress={() => { void removeWhy(i); }} />
          </Row>
        ))}
        <Field label="Add a reason" value={why} onChangeText={setWhy} placeholder="e.g. Clear RBI Grade B and build a stable career" maxLength={200} multiline />
        <Button label="Add reason" icon="add" variant="secondary" disabled={!why.trim()} onPress={() => { void addWhy(); }} />
      </Card>

      <SectionHeader title="My affirmations" />
      <Card style={{ gap: t.spacing.md }}>
        {affirmations.length === 0 ? <Text variant="caption" tone="muted">Short sentences in your own words. They sync with your account if you sign in.</Text> : null}
        {affirmations.map((a) => (
          <Row key={a.id} between>
            <View style={{ flex: 1 }}><Text>{a.text}</Text></View>
            <IconButton icon="create-outline" label={`Edit affirmation: ${a.text}`} onPress={() => { setEditing(a.id); setAff(a.text); }} />
            <IconButton icon="trash-outline" label={`Delete affirmation: ${a.text}`} tone="danger" onPress={() => { void confirm({ title: 'Delete affirmation?', message: 'This removes it from this device and your synced account.', confirmLabel: 'Delete', destructive: true }).then((ok) => { if (ok) void deleteAffirmation(a.id); }); }} />
          </Row>
        ))}
        <Field label={editing ? 'Edit affirmation' : 'New affirmation'} value={aff} onChangeText={(v) => { setAff(v); setAffError(undefined); }} error={affError} placeholder="e.g. I show up even when I don’t feel like it" maxLength={200} />
        <Row gap={t.spacing.sm}>
          <View style={{ flex: 1 }}><Button label={editing ? 'Save changes' : 'Add affirmation'} onPress={() => { void submitAff(); }} disabled={!aff.trim()} /></View>
          {editing ? <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => { setEditing(null); setAff(''); setAffError(undefined); }} /></View> : null}
        </Row>
      </Card>

      <SectionHeader title="Favourites" />
      {favourites.length === 0 ? <Card><EmptyState icon="heart-outline" title="No favourites yet" body="Tap the heart on any quote to keep it here." /></Card>
        : favourites.map((q) => <QuoteCard key={q.id} quote={q} compact saved onToggleSave={() => { void toggleSavedQuote(q.id); }} />)}

      <SectionHeader title="All quotes" />
      <Row wrap gap={t.spacing.sm}>
        <Chip label="All" selected={topic === 'all'} onPress={() => setTopic('all')} />
        {TOPICS.map((tp) => <Chip key={tp} label={tp[0]!.toUpperCase() + tp.slice(1)} selected={topic === tp} onPress={() => setTopic(tp)} />)}
      </Row>
      {list.map((q) => <QuoteCard key={q.id} quote={q} compact saved={isSaved(q.id)} onToggleSave={() => { void toggleSavedQuote(q.id); }} />)}
    </Screen>
  );
}

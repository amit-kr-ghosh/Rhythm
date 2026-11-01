import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Card, Row, Text } from '../ui';
import type { Quote } from '../../domain/quotes';

export function QuoteCard({ quote, saved, onToggleSave, compact }: { quote: Quote; saved: boolean; onToggleSave: () => void; compact?: boolean }) {
  const t = useTheme();
  return (
    <Card tone={compact ? 'surface' : 'accent'}>
      <Text variant={compact ? 'body' : 'heading'} style={{ fontStyle: 'italic' }}>“{quote.text}”</Text>
      <Row between style={{ marginTop: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">— {quote.author}</Text>
          {quote.source ? <Text variant="caption" tone="faint">{quote.source}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from favourites' : 'Save to favourites'} accessibilityState={{ selected: saved }} onPress={onToggleSave}
          style={{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={saved ? t.colors.danger : t.colors.textMuted} />
        </Pressable>
      </Row>
    </Card>
  );
}

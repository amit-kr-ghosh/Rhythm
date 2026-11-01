import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { auth } from '../../services/cloud';
import { Banner, BrandMark, Button, Card, IconButton, Row, Screen, Text } from '../ui';
import { safeBack } from '../../navigation/safeBack';

/** Shared auth chrome. Shows a clear explanation instead of a broken form when Supabase isn't configured. */
export function AuthShell({ title, subtitle, children, requireCloud = true }: { title: string; subtitle?: string; children: React.ReactNode; requireCloud?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const available = auth.available();
  return (
    <Screen>
      <Row between>
        <IconButton icon="chevron-back" label="Back" solid onPress={() => safeBack(router)} />
        <BrandMark size={48} />
      </Row>
      <View style={{ gap: t.spacing.xs, marginTop: t.spacing.md }}>
        <Text variant="hero" fit numberOfLines={2} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      </View>
      {requireCloud && !available ? (
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="heading">Cloud sync isn’t set up in this build</Text>
          <Text tone="muted">
            Rhythm works fully offline — your timetable, sessions and progress are saved on this device. To enable accounts and sync, set the Supabase
            URL and anon key in your environment (see the README) and rebuild.
          </Text>
          <Button label="Continue without an account" variant="secondary" onPress={() => safeBack(router)} />
        </Card>
      ) : children}
    </Screen>
  );
}

export { Banner };

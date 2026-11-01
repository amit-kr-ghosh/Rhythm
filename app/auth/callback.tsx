import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { Banner, Button } from '../../src/components/ui';
import { auth } from '../../src/services/cloud';

/** Landing screen for email-confirmation and OAuth deep links. */
export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    void auth.handleAuthLink(url).then((r) => { if (r.ok) router.replace('/(tabs)' as never); else setError(r.message); });
  }, [url, router]);
  return (
    <AuthShell title="Signing you in">
      {error ? <Banner tone="danger" text={error} /> : <Banner text="Completing sign-in…" />}
      {error ? <Button label="Back to sign in" onPress={() => router.replace('/auth/login' as never)} /> : null}
    </AuthShell>
  );
}

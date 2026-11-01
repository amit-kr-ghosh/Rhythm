import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { Banner, Button } from '../../src/components/ui';
import { Field } from '../../src/components/inputs';
import { auth } from '../../src/services/cloud';
import { validateCredentials } from '../../src/domain/validation';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const url = Linking.useURL();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready) return;
    const link = url ?? (params.code ? `rhythm://auth/reset?code=${params.code}` : null);
    if (!link) return;
    void auth.handleAuthLink(link).then((r) => { if (r.ok) setReady(true); else setLinkError(r.message); });
  }, [url, params.code, ready]);

  const submit = async () => {
    const v = validateCredentials({ email: 'x@example.com', password, confirm }, 'register');
    const errs = v.errors as Record<string, string>;
    setError({ password: errs.password ?? '', confirm: errs.confirm ?? '' });
    if (errs.password || errs.confirm) return;
    setBusy(true);
    const res = await auth.updatePassword(password);
    setBusy(false);
    if (res.ok) setDone(true); else setLinkError(res.message);
  };

  return (
    <AuthShell title="Choose a new password">
      {linkError ? <Banner tone="danger" text={linkError} /> : null}
      {!ready && !linkError ? <Banner text="Verifying your reset link…" /> : null}
      {ready && !done ? (
        <>
          <Field label="New password" value={password} onChangeText={setPassword} secure autoCapitalize="none" error={error.password || undefined} />
          <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" error={error.confirm || undefined} />
          <Button label="Update password" loading={busy} onPress={() => void submit()} />
        </>
      ) : null}
      {done ? <><Banner tone="success" text="Password updated." /><Button label="Continue" onPress={() => router.replace('/(tabs)' as never)} /></> : null}
    </AuthShell>
  );
}

import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { Banner, Button, Text } from '../../src/components/ui';
import { Field } from '../../src/components/inputs';
import { Pressable } from 'react-native';
import { auth } from '../../src/services/cloud';
import { config } from '../../src/services/config';
import { validateCredentials } from '../../src/domain/validation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateCredentials({ email: email.trim(), password }, 'login');
    setErrors(v.errors as Record<string, string>); setMessage(null);
    if (!v.ok) return;
    setBusy(true);
    const res = await auth.signIn(email.trim(), password);
    setBusy(false);
    if (res.ok) router.replace('/(tabs)' as never); else setMessage(res.message);
  };
  const google = async () => {
    setBusy(true); setMessage(null);
    const res = await auth.signInWithGoogle();
    setBusy(false);
    if (res.ok) router.replace('/(tabs)' as never); else setMessage(res.message);
  };

  return (
    <AuthShell title="Sign in" subtitle="Optional. Rhythm works fully offline — sign in only to back up and sync across devices.">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} returnKeyType="next" />
      <Field label="Password" value={password} onChangeText={setPassword} secure={!show} autoCapitalize="none" error={errors.password} returnKeyType="go" onSubmitEditing={() => void submit()} />
      <Pressable accessibilityRole="button" onPress={() => setShow(!show)} style={{ minHeight: 40, justifyContent: 'center' }}><Text variant="caption" tone="accent">{show ? 'Hide password' : 'Show password'}</Text></Pressable>
      {message ? <Banner tone="danger" text={message} /> : null}
      <Button label="Sign in" loading={busy} onPress={() => void submit()} />
      {config.googleAuthEnabled ? <Button label="Continue with Google" variant="secondary" icon="logo-google" loading={busy} onPress={() => void google()} /> : null}
      <Button label="Forgot password?" variant="ghost" onPress={() => router.push('/auth/forgot' as never)} />
      <Button label="Create an account" variant="ghost" onPress={() => router.replace('/auth/register' as never)} />
    </AuthShell>
  );
}

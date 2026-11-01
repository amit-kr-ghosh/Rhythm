import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { Banner, Button } from '../../src/components/ui';
import { Field } from '../../src/components/inputs';
import { auth } from '../../src/services/cloud';
import { validateCredentials } from '../../src/domain/validation';

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateCredentials({ email: email.trim(), password, confirm }, 'register');
    setErrors(v.errors as Record<string, string>); setMessage(null);
    if (!v.ok) return;
    setBusy(true);
    const res = await auth.signUp(email.trim(), password);
    setBusy(false);
    if (!res.ok) { setMessage({ tone: 'danger', text: res.message }); return; }
    if (res.needsEmailConfirmation) setMessage({ tone: 'success', text: 'Check your inbox and confirm your email, then sign in.' });
    else router.replace('/(tabs)' as never);
  };

  return (
    <AuthShell title="Create account" subtitle="Your existing data on this device will be uploaded to your new account.">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <Field label="Password" value={password} onChangeText={setPassword} secure autoCapitalize="none" error={errors.password} hint="At least 8 characters." />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" error={errors.confirm} onSubmitEditing={() => void submit()} />
      {message ? <Banner tone={message.tone} text={message.text} /> : null}
      <Button label="Create account" loading={busy} onPress={() => void submit()} />
      <Button label="I already have an account" variant="ghost" onPress={() => router.replace('/auth/login' as never)} />
    </AuthShell>
  );
}

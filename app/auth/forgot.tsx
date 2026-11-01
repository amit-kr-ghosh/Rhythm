import React, { useState } from 'react';
import { AuthShell } from '../../src/components/auth/AuthShell';
import { Banner, Button } from '../../src/components/ui';
import { Field } from '../../src/components/inputs';
import { auth } from '../../src/services/cloud';
import { validateEmail } from '../../src/domain/validation';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = validateEmail(email.trim());
    setError(v.errors.email); setFailure(null);
    if (!v.ok) return;
    setBusy(true);
    const res = await auth.sendPasswordReset(email.trim());
    setBusy(false);
    if (res.ok) setSent(true); else setFailure(res.message);
  };

  return (
    <AuthShell title="Reset password" subtitle="Enter your email and we'll send a reset link.">
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={error} onSubmitEditing={() => void submit()} />
      {sent ? <Banner tone="success" text="If an account exists for that email, a reset link is on its way." /> : null}
      {failure ? <Banner tone="danger" text={failure} /> : null}
      <Button label="Send reset link" loading={busy} onPress={() => void submit()} />
    </AuthShell>
  );
}

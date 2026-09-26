import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import type { PendingRegistration } from '@/services/auth';

function feedback(error: unknown) {
  if (error instanceof ApiError && Object.keys(error.fields).length) return Object.values(error.fields).flat().join('\n');
  return errorMessage(error);
}
export function PasswordField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.passwordRow}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
        secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} maxLength={128} style={[styles.input, { flex: 1 }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onPress={() => setVisible(current => !current)} style={styles.visibility}>
        <MaterialIcons name={visible ? 'visibility-off' : 'visibility'} size={22} color="#766A68" />
      </Pressable>
    </View>
  </View>;
}
function Action({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}
function Success({ message }: { message: string }) {
  const router = useRouter();
  return <View style={styles.form}><Text accessibilityRole="alert" style={styles.label}>{message}</Text>
    <Action title="Back to Profile Settings" onPress={() => router.replace('/profile-settings')} /></View>;
}

// ========================================
// CHANGE EMAIL VERIFICATION
// Passwords and pending authorization stay in screen memory.
// Only a confirmed backend response completes the change.
// ========================================
export function ChangeEmailForm() {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<PendingRegistration | null>(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [success, setSuccess] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const busy = working || auth.busy;
  const run = async (action: (active: () => boolean) => Promise<void>) => {
    if (lock.current || auth.busy) return;
    lock.current = true; setWorking(true); setError('');
    const version = generation.current;
    const active = () => version === generation.current;
    try { await action(active); } catch (e) { if (active()) setError(feedback(e)); }
    finally { lock.current = false; if (active()) { setWorking(false); setPassword(''); } }
  };
  const wait = (seconds: number) => { const now = Date.now(); setClock(now); setResendAt(now + seconds * 1000); };
  if (success) return <Success message="Email changed successfully." />;
  return <View style={styles.form}>
    <View style={styles.field}><Text style={styles.label}>Current Email</Text><Text selectable style={styles.copy}>{auth.user?.email}</Text>
      {auth.user?.email_verified_at ? <Text style={styles.copy}>Verified</Text> : null}</View>
    {pending ? <>
      <Text accessibilityRole="header" style={styles.label}>Verify New Email</Text>
      <Text style={styles.copy}>We sent a 6-digit verification code to your new email.</Text>
      <Text selectable style={styles.copy}>{email.trim().toLowerCase()}</Text>
      <Text style={styles.copy}>Code expires in 15 minutes. Delivery may take a moment.</Text>
      <TextInput accessibilityLabel="Verification code" value={code} onChangeText={value => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad" maxLength={6} editable={!busy} style={styles.input} autoComplete="one-time-code" />
      <Action title={working ? 'Please wait...' : 'Verify & Change Email'} disabled={busy || !/^[0-9]{6}$/.test(code)}
        onPress={() => void run(async active => { await auth.verifyEmailChange(pending.pending_token, code); if (active()) { setCode(''); setPending(null); setResendAt(0); setSuccess(true); } })} />
      <Action title={remaining ? `Resend code in ${remaining}s` : 'Resend code'} disabled={busy || remaining > 0}
        onPress={() => void run(async active => {
          const response = await auth.resendEmailChange(pending.pending_token);
          if (active()) { wait(response.resend_after); setCode(''); }
        })} />
      <Action title="Change Email Address" disabled={busy} onPress={() => { setPending(null); setCode(''); setPassword(''); setError(''); setResendAt(0); }} />
    </> : <>
      <PasswordField label="Current Password" value={password} onChange={setPassword} disabled={busy} />
      <View style={styles.field}><Text style={styles.label}>New Email</Text>
        <TextInput accessibilityLabel="New Email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} maxLength={254} style={styles.input} /></View>
      <Action title={working ? 'Sending...' : 'Send Verification Code'} disabled={busy || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().toLowerCase() === auth.user?.email.toLowerCase()}
        onPress={() => void run(async active => {
          const response = await auth.requestEmailChange(password, email);
          if (active()) { setPending(response); wait(response.resend_after); }
        })} />
    </>}
    {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Text style={styles.copy}>If a response was lost, refresh Profile to check your current email before starting another change.</Text></> : null}
  </View>;
}

// ========================================
// CHANGE PASSWORD
// The current login is preserved; other sessions are revoked by Laravel.
// ========================================
export function ChangePasswordForm() {
  const auth = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const busy = working || auth.busy;
  const valid = current.length > 0 && password.length >= 8 && password === confirmation && password !== current;
  const submit = async () => {
    if (!valid || lock.current || auth.busy) return;
    lock.current = true; setWorking(true); setError('');
    const version = generation.current;
    try {
      await auth.changePassword(current, password, confirmation);
      if (version === generation.current) setSuccess(true);
    } catch (e) { if (version === generation.current) setError(feedback(e)); }
    finally {
      lock.current = false;
      if (version === generation.current) { setWorking(false); setCurrent(''); setPassword(''); setConfirmation(''); }
    }
  };
  if (success) return <Success message="Password updated successfully." />;
  return <View style={styles.form}>
    <PasswordField label="Current Password" value={current} onChange={setCurrent} disabled={busy} />
    <PasswordField label="New Password" value={password} onChange={setPassword} disabled={busy} />
    <PasswordField label="Confirm New Password" value={confirmation} onChange={setConfirmation} disabled={busy} />
    <Text style={styles.copy}>At least 8 characters. Passwords must match and differ from your current password.</Text>
    <Text style={styles.copy}>You will stay signed in here. Other sessions will be signed out.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Action title={working ? 'Updating...' : 'Change Password'} onPress={() => void submit()} disabled={busy || !valid} />
  </View>;
}
const styles = StyleSheet.create({
  form: { gap: 18 }, field: { gap: 8 }, label: { color: '#372E2E', fontSize: 15, fontWeight: '700' },
  copy: { color: '#766A68', fontSize: 13, lineHeight: 20 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#E8DDD6', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, color: '#372E2E', fontSize: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visibility: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 12, backgroundColor: '#D93A3A' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  error: { color: '#B42318', fontSize: 13, lineHeight: 20 },
});

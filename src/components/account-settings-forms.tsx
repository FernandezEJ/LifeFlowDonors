import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
        <MaterialIcons name={visible ? 'visibility-off' : 'visibility'} size={22} color={PALETTE.primary} />
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
  return <View style={styles.form}><Text accessibilityRole="alert" style={[styles.label,{color:PALETTE.successText}]}>{message}</Text>
    <Action title="Back to Profile Settings" onPress={() => router.replace('/profile-settings')} /></View>;
}

function TextAction({ title, onPress, disabled }: { title: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [emailStyles.textAction, pressed && !disabled && emailStyles.pressed]}>
    <Text style={[emailStyles.link, disabled && emailStyles.muted]}>{title}</Text>
  </Pressable>;
}

function EmailCode({ label, value, onChange, disabled, invalid, onSubmit }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; invalid: boolean; onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [activeDigit, setActiveDigit] = useState(0);
  return <View style={emailStyles.codeEntry}>
    <View style={emailStyles.codeSlots} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 6 }, (_, index) => <View key={index}
        style={[emailStyles.codeSlot, invalid && emailStyles.invalid, focused && activeDigit === index && emailStyles.focused]}>
        <Text maxFontSizeMultiplier={2} style={emailStyles.codeDigit}>{value[index] || ''}</Text>
      </View>)}
    </View>
    <TextInput accessibilityLabel={label} accessibilityHint="Enter six digits or paste the full verification code."
      value={value} onChangeText={text => { const digits = text.replace(/[^0-9]/g, '').slice(0, 6); onChange(digits); setActiveDigit(Math.min(digits.length, 5)); }}
      keyboardType="number-pad" maxLength={6} editable={!disabled} autoComplete="one-time-code" autoFocus
      autoCorrect={false} autoCapitalize="none" caretHidden underlineColorAndroid="transparent"
      selectionColor="transparent" cursorColor="transparent" selectionHandleColor="transparent"
      onFocus={() => { setFocused(true); setActiveDigit(Math.min(value.length, 5)); }} onBlur={() => setFocused(false)}
      onSelectionChange={event => setActiveDigit(Math.min(event.nativeEvent.selection.start, 5))}
      onSubmitEditing={() => { if (!disabled && /^[0-9]{6}$/.test(value)) onSubmit(); }} style={emailStyles.codeInput} />
  </View>;
}

// ========================================
// CHANGE EMAIL VERIFICATION
// Current-email OTP confirmation precedes the existing new-email verification.
// Only a confirmed backend response completes the change.
// ========================================
export function ChangeEmailForm() {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const currentConfirmed = useRef(false);
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
    finally { lock.current = false; if (active()) setWorking(false); }
  };
  const wait = (seconds: number) => { const now = Date.now(); setClock(now); setResendAt(now + seconds * 1000); };
  const confirmCurrentEmail = () => run(async active => {
    // A retry after new-email validation fails must not reuse the already-consumed login code.
    if (!currentConfirmed.current) { await auth.confirmEmailLogin(auth.profile?.mobile_number ?? '', code); currentConfirmed.current = true; }
    if (!active()) return;
    const response = await auth.requestEmailChange(email);
    if (active()) { setPending(response); setCode(''); wait(response.resend_after); }
  });
  const confirmNewEmail = () => {
    if (!pending) return;
    return run(async active => { await auth.verifyEmailChange(pending.pending_token, code); if (active()) { setCode(''); setPending(null); setResendAt(0); setSuccess(true); } });
  };
  if (success) return <Success message="Email changed successfully." />;
  return <View style={[styles.form, emailStyles.form]}>
    <View style={emailStyles.header}>
      <Image accessibilityLabel="LifeFlow mascot" resizeMode="contain" source={require('../../assets/images/LogoMascot.png')} style={emailStyles.mascot} />
      {(pending || confirming) && <Text style={emailStyles.helper}>{pending ? 'Step 2 of 2' : 'Step 1 of 2'}</Text>}
      <Text accessibilityRole="header" style={emailStyles.title}>{pending ? 'Verify New Email' : confirming ? 'Confirm Current Email' : 'Change Your Email'}</Text>
      <Text style={emailStyles.subtitle}>{pending ? 'We sent a 6-digit verification code to your new email.'
        : confirming ? 'Enter the login code sent to your current email.' : 'Verify your current email, then confirm your new address.'}</Text>
      <Text selectable style={emailStyles.address}>{pending ? email.trim().toLowerCase() : auth.user?.email}</Text>
      {!pending && !confirming && auth.user?.email_verified_at ? <Text style={emailStyles.verified}>Verified</Text> : null}
    </View>
    {pending ? <>
      <EmailCode key="new-email" label="Verification code" value={code} onChange={setCode} disabled={busy} invalid={!!error}
        onSubmit={() => void confirmNewEmail()} />
      <Text style={emailStyles.helper}>Code expires in 15 minutes. Delivery may take a moment.</Text>
      <Action title={working ? 'Please wait...' : 'Confirm Email'} disabled={busy || !/^[0-9]{6}$/.test(code)}
        onPress={() => void confirmNewEmail()} />
      <View style={emailStyles.resendRow}><Text style={emailStyles.helper}>Didn&apos;t receive the code?</Text>
      <TextAction title={remaining ? `Resend code in ${remaining}s` : 'Resend code'} disabled={busy || remaining > 0}
        onPress={() => void run(async active => {
          const response = await auth.resendEmailChange(pending.pending_token);
          if (active()) { wait(response.resend_after); setCode(''); }
        })} />
      </View>
      <TextAction title="Change Email Address" disabled={busy} onPress={() => { currentConfirmed.current = false; setPending(null); setConfirming(false); setCode(''); setError(''); setResendAt(0); }} />
    </> : confirming ? <>
      <EmailCode key="current-email" label="Current email code" value={code} onChange={setCode} disabled={busy} invalid={!!error}
        onSubmit={() => void confirmCurrentEmail()} />
      <Text style={emailStyles.helper}>Code expires in 10 minutes. Your new address is {email.trim().toLowerCase()}.</Text>
      <Action title={working ? 'Please wait...' : 'Continue'} disabled={busy || !/^[0-9]{6}$/.test(code)} onPress={() => void confirmCurrentEmail()} />
      <View style={emailStyles.resendRow}><Text style={emailStyles.helper}>Didn&apos;t receive the code?</Text>
      <TextAction title={remaining ? `Resend code in ${remaining}s` : 'Resend current email code'} disabled={busy || remaining > 0} onPress={() => void run(async active => {
        const response = await auth.requestLoginCode(auth.profile?.mobile_number ?? '');
        if (active()) { currentConfirmed.current = false; wait(response.resend_after); setCode(''); }
      })} />
      </View>
      <TextAction title="Change Email Address" disabled={busy} onPress={() => { currentConfirmed.current = false; setConfirming(false); setCode(''); setError(''); }} />
    </> : <>
      <View style={styles.field}><Text style={styles.label}>New Email</Text>
        <TextInput accessibilityLabel="New Email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} maxLength={254} style={styles.input} /></View>
      <Action title={working ? 'Sending...' : 'Send Code'} disabled={busy || !auth.profile?.mobile_number || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().toLowerCase() === auth.user?.email.toLowerCase()}
        onPress={() => void run(async active => {
          const response = await auth.requestLoginCode(auth.profile?.mobile_number ?? '');
          if (active()) { currentConfirmed.current = false; setConfirming(true); setCode(''); wait(response.resend_after); }
        })} />
    </>}
    {error ? <><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
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
  form: { gap: 18 }, field: { gap: 8 }, label: { color: PALETTE.text, fontSize: 15, fontWeight: '700' },
  copy: { color: PALETTE.neutral, fontSize: 13, lineHeight: 20 },
  input: { minHeight: 52, borderWidth: 1, borderColor: PALETTE.controlBorder, backgroundColor: PALETTE.surface, borderRadius: 12, padding: 12, color: PALETTE.text, fontSize: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  visibility: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 12, backgroundColor: PALETTE.primary },
  buttonText: { color: PALETTE.surface, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  error: { color: PALETTE.danger, fontSize: 13, lineHeight: 20 },
});
const emailStyles = StyleSheet.create({
  form: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingVertical: 12 },
  header: { alignItems: 'center', gap: 10, marginBottom: 6 },
  mascot: { width: 96, height: 96, marginBottom: 6 },
  title: { color: PALETTE.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: PALETTE.neutral, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  address: { color: PALETTE.text, fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  verified: { color: PALETTE.successText, fontSize: 13, fontWeight: '600' },
  helper: { color: PALETTE.neutral, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 8 },
  textAction: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  link: { color: PALETTE.primary, fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  muted: { color: PALETTE.neutral }, pressed: { opacity: 0.7 },
  codeEntry: { position: 'relative' },
  codeSlots: { zIndex: 1, backgroundColor: PALETTE.background, flexDirection: 'row', gap: 6 },
  codeSlot: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: 10,
    borderWidth: 1, borderColor: PALETTE.controlBorder, borderRadius: 12, backgroundColor: PALETTE.surface },
  focused: { borderWidth: 2, borderColor: PALETTE.primary }, invalid: { borderColor: PALETTE.danger },
  codeDigit: { color: PALETTE.text, fontSize: 24, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  codeInput: { zIndex: 0, position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    color: 'transparent', backgroundColor: 'transparent', fontSize: 24, textAlign: 'center' },
});

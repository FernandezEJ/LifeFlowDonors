import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ApiError, errorMessage } from '@/services/api';
import { isLoginIdentifier, LOGIN_NOTICE, normalizeLoginIdentifier } from '@/services/auth';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = { background: PALETTE.cream, brand: PALETTE.primary, brandPressed: PALETTE.primaryPressed, text: PALETTE.text, muted: PALETTE.neutral, border: PALETTE.border, inputBackground: PALETTE.surface, error: PALETTE.danger, white: PALETTE.surface };

export default function LoginScreen() {
  const router = useRouter();
  const { requestLoginCode, login, busy } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const pendingIdentifier = useRef('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'request' | 'verify' | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [codeFocused, setCodeFocused] = useState(false);
  const [activeDigit, setActiveDigit] = useState(0);
  const [resent, setResent] = useState(false);
  const expiryDeadline = useRef<number | null>(null);
  const deadline = useRef(0), lock = useRef(false), generation = useRef(0);
  const working = busy || action !== null;
  // Codes and pending login state stay in memory; existing session storage receives only verified tokens.
  useFocusEffect(useCallback(() => () => {
    generation.current++; setCode(''); setVerifying(false); setError(''); setAction(null);
    expiryDeadline.current = null; setExpiresIn(null); setCodeFocused(false); setResent(false);
    pendingIdentifier.current = ''; deadline.current = 0; setRemaining(0);
  }, []));
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
      if (expiryDeadline.current !== null) setExpiresIn(Math.max(0, Math.ceil((expiryDeadline.current - performance.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const run = async (kind: 'request' | 'verify', operation: (active: () => boolean) => Promise<void>) => {
    if (lock.current || busy) return;
    lock.current = true; setAction(kind); setError('');
    const version = generation.current;
    try { await operation(() => version === generation.current); }
    catch (failure) {
      if (version === generation.current) setError(failure instanceof ApiError && failure.fields.code?.length ? failure.fields.code.join('\n') : errorMessage(failure));
    } finally { lock.current = false; if (version === generation.current) setAction(null); }
  };
  const request = () => {
    if (pendingIdentifier.current && performance.now() < deadline.current) return;
    const normalized = verifying ? pendingIdentifier.current : normalizeLoginIdentifier(identifier);
    if (!isLoginIdentifier(normalized)) { setError('Enter a valid email or Philippine contact number.'); return; }
    void run('request', async active => {
      const response = await requestLoginCode(normalized);
      if (active()) {
        pendingIdentifier.current = normalized;
        setResent(verifying); setVerifying(true); setCode(''); setActiveDigit(0);
        deadline.current = performance.now() + response.resend_after * 1000; setRemaining(response.resend_after);
        const duration = Number.isFinite(response.expires_in) && response.expires_in > 0 ? response.expires_in : null;
        expiryDeadline.current = duration === null ? null : performance.now() + duration * 1000;
        setExpiresIn(duration);
      }
    });
  };
  const verify = () => {
    if (!pendingIdentifier.current || !verifying) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit login code.'); return; }
    const normalized = pendingIdentifier.current;
    void run('verify', async () => { await login(normalized, code); });
  };
  const changeNumber = () => {
    if (lock.current || busy) return;
    generation.current++; setVerifying(false); setCode(''); setError('');
    expiryDeadline.current = null; setExpiresIn(null); setCodeFocused(false); setResent(false);
    pendingIdentifier.current = ''; deadline.current = 0; setRemaining(0);
  };
  return <SafeAreaView style={styles.safeArea}>
    <View style={styles.decorativeCircleTop} /><View style={styles.decorativeCircleBottom} />
    {verifying && <View style={styles.verificationTopBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to email or contact number" disabled={working}
        accessibilityState={{ disabled: working }} onPress={changeNumber}
        style={({ pressed }) => [styles.backButton, (working || pressed) && styles.verificationControlDimmed]}>
        <MaterialIcons name="arrow-back" size={24} color={PALETTE.primary} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.verificationTopTitle}>Account Verification</Text>
      <View style={styles.topBarSpacer} />
    </View>}
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : verifying ? 'height' : undefined} style={styles.keyboardView}>
      <ScrollView contentContainerStyle={[styles.scrollContent, verifying && styles.verificationScrollContent]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Image accessibilityLabel="LifeFlow mascot" resizeMode="contain" source={require('../../../assets/images/LogoMascot.png')} style={[styles.logo, verifying && styles.verificationLogo]} />
            <Text accessibilityRole="header" style={[styles.title, verifying && styles.verificationTitle]}>{verifying ? 'Verify Your Login' : 'Welcome to LifeFlow'}</Text>
            <Text style={styles.subtitle}>{verifying ? LOGIN_NOTICE : 'Use your registered email or contact number. Your code goes to your verified email.'}</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{verifying ? 'Verification code' : 'Email or Contact Number'}</Text>
              {verifying ? <View style={styles.codeEntry}>
                {/* Opaque, touch-through slots cover native text without hiding the interactive input. */}
                <View style={styles.codeSlots} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {Array.from({ length: 6 }, (_, index) => <View key={index} testID={`login-code-slot-${index}`}
                    style={[styles.codeSlot, error ? styles.inputError : null, codeFocused && activeDigit === index && styles.codeSlotFocused]}>
                    <Text maxFontSizeMultiplier={2} style={styles.codeDigit}>{code[index] || ''}</Text>
                  </View>)}
                </View>
                <TextInput accessibilityLabel="6-digit login code" accessibilityHint="Enter six digits or paste the full verification code."
                  autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} editable={!working}
                  autoCorrect={false} autoCapitalize="none" caretHidden underlineColorAndroid="transparent"
                  selectionColor="transparent" cursorColor="transparent" selectionHandleColor="transparent"
                  value={code} onChangeText={value => {
                    const digits = value.replace(/[^0-9]/g, '').slice(0, 6);
                    setCode(digits); setActiveDigit(Math.min(digits.length, 5));
                  }} onFocus={() => { setCodeFocused(true); setActiveDigit(Math.min(code.length, 5)); }} onBlur={() => setCodeFocused(false)}
                  onSelectionChange={event => setActiveDigit(Math.min(event.nativeEvent.selection.start, 5))}
                  onSubmitEditing={verify} style={styles.codeInput} />
              </View>
                : <TextInput accessibilityLabel="Email or Contact Number" autoComplete="username" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!working}
                  value={identifier} onChangeText={setIdentifier} placeholder="Email or 09XXXXXXXXX" placeholderTextColor={COLORS.muted} onSubmitEditing={request} style={styles.input} />}
              {verifying && expiresIn === 0 && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.codeExpiry, styles.inputExpired]}>
                Code expired. Request a new code.
              </Text>}
            </View>
          </View>
          <View style={[styles.actions, verifying && styles.verificationActionGroup]}>
            {verifying && <View style={styles.verificationActions}>
              <View style={styles.resendRow}>
                <Text style={[styles.accountText, styles.resendPrompt]}>Didn’t receive the code?</Text>
                <Pressable accessibilityRole="button" disabled={working || remaining > 0} onPress={request}
                  accessibilityState={{ disabled: working || remaining > 0, busy: action === 'request' }} style={styles.resendAction}>
                  <Text style={[styles.verificationActionText, (working || remaining > 0) && styles.verificationActionDisabled]}>{action === 'request' ? 'Sending…' : remaining > 0 ? 'Resend in ' + remaining + 's' : 'Resend code'}</Text>
                </Pressable>
              </View>
              {resent && <Text accessibilityLiveRegion="polite" style={styles.codeFeedback}>New code requested. Please check your email.</Text>}
            </View>}
            {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorText}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={working} onPress={verifying ? verify : request}
              accessibilityState={{ disabled: working, busy: working }}
              style={({ pressed }) => [styles.primaryButton, verifying && working && styles.verificationControlDimmed, verifying && pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>{action === 'verify' ? 'Verifying...' : action === 'request' ? 'Sending...' : verifying ? 'Verify & Continue' : 'Continue'}</Text>
            </Pressable>
            {verifying ? <Text style={styles.securityNote}>Your account verification is secure</Text> : <View style={styles.registerRow}>
              <Text style={[styles.accountText, styles.registerPrompt]}>Don’t have an account?</Text>
              <Pressable accessibilityRole="link" accessibilityLabel="Register here" accessibilityState={{disabled:working}} disabled={working}
                onPress={() => router.push('/(auth)/register')} style={styles.registerLink}><Text style={styles.registerText}>Register here</Text></Pressable>
            </View>}
            {!verifying && <Pressable accessibilityRole="link" disabled={working} accessibilityState={{disabled:working}}
              onPress={()=>{if(!lock.current && !busy)router.push('/(auth)/trouble-signing-in');}} style={styles.verificationTextAction}>
              <Text style={[styles.verificationActionText, styles.verificationSecondaryText, working && styles.verificationActionDisabled]}>Trouble signing in?</Text>
            </Pressable>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  decorativeCircleTop: {
    position: 'absolute',
    top: -80,
    right: -90,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: PALETTE.decorativeTop,
  },
  decorativeCircleBottom: {
    position: 'absolute',
    bottom: -115,
    left: -100,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: PALETTE.decorativeBottom,
  },
  header: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 28,
  },
  logo: {
    width: 112,
    height: 112,
    marginBottom: 12,
  },
  title: {
    color: PALETTE.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 340,
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  form: {
    gap: 18,
  },
  fieldGroup: {
    gap: 7,
  },
  label: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    minHeight: 54,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: PALETTE.controlBorder,
    borderRadius: 16,
    backgroundColor: COLORS.inputBackground,
    color: COLORS.text,
    fontSize: 16,
  },
  passwordInput: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: PALETTE.controlBorder,
    borderRadius: 16,
    backgroundColor: COLORS.inputBackground,
  },
  passwordTextInput: {
    flex: 1,
    minHeight: 52,
    paddingRight: 12,
    color: COLORS.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -6,
    paddingVertical: 4,
  },
  forgotText: {
    color: COLORS.brand,
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    gap: 16,
    marginTop: 28,
  },
  verificationActionGroup: {
    gap: 12,
    marginTop: 16,
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.brand,
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
  registerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  registerPrompt: {
    maxWidth: '100%',
    textAlign: 'center',
  },
  registerLink: {
    maxWidth: '100%',
    minHeight: 48,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  verificationActions: {
    gap: 4,
  },
  resendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    rowGap: 0,
  },
  resendPrompt: {
    maxWidth: '100%',
    textAlign: 'center',
  },
  resendAction: {
    maxWidth: '100%',
    minHeight: 48,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  verificationTextAction: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationActionText: {
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  verificationSecondaryText: {
    fontWeight: '500',
  },
  verificationActionDisabled: {
    color: COLORS.muted,
  },
  accountText: {
    color: COLORS.text,
    fontSize: 15,
  },
  registerText: {
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '700',
  },
  verificationTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  topBarSpacer: {
    width: 44,
  },
  verificationTopTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  verificationScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  verificationLogo: {
    width: 96,
    height: 96,
    marginBottom: 16,
  },
  verificationTitle: {
    fontSize: 28,
  },
  codeEntry: {
    position: 'relative',
  },
  codeSlots: {
    zIndex: 1,
    backgroundColor: COLORS.background,
    flexDirection: 'row',
    gap: 6,
  },
  codeSlot: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: PALETTE.controlBorder,
    borderRadius: 12,
    backgroundColor: COLORS.inputBackground,
  },
  codeSlotFocused: {
    borderWidth: 2,
    borderColor: COLORS.brand,
  },
  codeDigit: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  codeInput: {
    zIndex: 0,
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 24,
    textAlign: 'center',
  },
  codeExpiry: {
    marginTop: 6,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  inputExpired: {
    color: COLORS.error,
  },
  codeFeedback: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  securityNote: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  verificationControlDimmed: {
    opacity: 0.55,
  },
});

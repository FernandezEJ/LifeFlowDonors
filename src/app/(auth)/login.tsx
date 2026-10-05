import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = { background: '#FFF9F2', brand: '#D93A3A', brandPressed: '#BE2F2F', text: '#372E2E', muted: '#766A68', border: '#E8DDD6', inputBackground: '#FFFFFF', error: '#C92A2A', white: '#FFFFFF' };

export default function LoginScreen() {
  const router = useRouter();
  const { requestLoginCode, login, busy } = useAuth();
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'request' | 'verify' | null>(null);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0), lock = useRef(false), generation = useRef(0);
  const working = busy || action !== null;
  // Codes and pending login state stay in memory; existing session storage receives only verified tokens.
  useFocusEffect(useCallback(() => () => { generation.current++; setCode(''); setVerifying(false); setError(''); setAction(null); }, []));
  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000))), 1000);
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
    if (verifying && performance.now() < deadline.current) return;
    if (!/^(?:0|\+?63)9\d{9}$/.test(mobile.replace(/[\s()-]/g, ''))) { setError('Enter a valid Philippine mobile number.'); return; }
    void run('request', async active => {
      const response = await requestLoginCode(mobile);
      if (active()) { setVerifying(true); setCode(''); deadline.current = performance.now() + response.resend_after * 1000; setRemaining(response.resend_after); }
    });
  };
  const verify = () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit login code.'); return; }
    void run('verify', async () => { await login(mobile, code); });
  };
  return <SafeAreaView style={styles.safeArea}>
    <View style={styles.decorativeCircleTop} /><View style={styles.decorativeCircleBottom} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Image accessibilityLabel="LifeFlow mascot" resizeMode="contain" source={require('../../../assets/images/LogoMascot.png')} style={styles.logo} />
            <Text accessibilityRole="header" style={styles.title}>{verifying ? 'Verify Your Login' : 'Welcome to LifeFlow'}</Text>
            <Text style={styles.subtitle}>{verifying ? 'We sent a verification code to the email linked to this mobile number.' : 'We’ll send a verification code to the email linked to your LifeFlow account.'}</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{verifying ? '6-digit login code' : 'Mobile Number'}</Text>
              {verifying ? <TextInput accessibilityLabel="6-digit login code" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} editable={!working}
                value={code} onChangeText={value => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))} onSubmitEditing={verify} style={styles.input} />
                : <TextInput accessibilityLabel="Mobile Number" autoComplete="tel" keyboardType="phone-pad" autoCorrect={false} editable={!working}
                  value={mobile} onChangeText={setMobile} placeholder="09XXXXXXXXX" placeholderTextColor={COLORS.muted} onSubmitEditing={request} style={styles.input} />}
              {verifying ? <Text style={styles.subtitle}>Code expires after 10 minutes. Delivery may take a moment.</Text> : null}
            </View>
          </View>
          <View style={styles.actions}>
            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={working} onPress={verifying ? verify : request} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{action === 'verify' ? 'Verifying...' : action === 'request' ? 'Sending...' : verifying ? 'Verify' : 'Continue'}</Text>
            </Pressable>
            {verifying ? <View style={styles.verificationActions}>
              <Text style={[styles.accountText, styles.verificationHelper]}>Didn’t receive the code?</Text>
              <Pressable accessibilityRole="button" disabled={working || remaining > 0} onPress={request} style={styles.verificationTextAction}>
                <Text style={[styles.verificationActionText, (working || remaining > 0) && styles.verificationActionDisabled]}>{remaining > 0 ? 'Resend code in ' + remaining + 's' : 'Resend Code'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={working} onPress={() => { if (lock.current) return; generation.current++; setVerifying(false); setCode(''); setError(''); }} style={styles.verificationTextAction}>
                <Text style={[styles.verificationActionText, styles.verificationSecondaryText, working && styles.verificationActionDisabled]}>Change Number</Text>
              </Pressable>
            </View> : <View style={styles.registerRow}>
              <Text style={styles.accountText}>Don’t have an account?</Text>
              <Pressable accessibilityRole="link" disabled={working} onPress={() => router.push('/(auth)/register')} style={{ padding: 12, minHeight: 44 }}><Text style={styles.registerText}>Register</Text></Pressable>
            </View>}
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
    backgroundColor: '#FDECE6',
  },
  decorativeCircleBottom: {
    position: 'absolute',
    bottom: -115,
    left: -100,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#FCE9E2',
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
    color: COLORS.brand,
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
    borderColor: COLORS.border,
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
    borderColor: COLORS.border,
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
  verificationActions: {
    gap: 4,
  },
  verificationHelper: {
    textAlign: 'center',
    marginBottom: 4,
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
});

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '@/services/api';
import { passwordResetApi, RESET_NOTICE } from '@/services/password-reset';

type Step = 'email' | 'code' | 'password' | 'success';
const TITLES: Record<Step, string> = { email: 'Forgot Password', code: 'Verify your email', password: 'Create a new password', success: 'Password changed' };

// ========================================
// EMAIL -> CODE -> NEW PASSWORD
// Reset credentials live only in this screen's memory, never storage or routes.
// ========================================
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const authorization = useRef('');
  const locked = useRef(false);
  const generation = useRef(0);
  const resendDeadline = useRef(0);

  const clearSensitive = useCallback(() => {
    authorization.current = '';
    setCode(''); setPassword(''); setConfirmation(''); setShowPassword(false);
  }, []);
  useFocusEffect(useCallback(() => () => {
    generation.current++;
    locked.current = false;
    clearSensitive(); setEmail(''); setError(''); setStep('email'); setBusy(false);
  }, [clearSensitive]));
  useEffect(() => {
    const timer = setInterval(() => setResendSeconds(Math.max(0, Math.ceil((resendDeadline.current - performance.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);
  const backToLogin = () => {
    generation.current++; clearSensitive(); setEmail('');
    router.replace('/(auth)/login');
  };

  // A synchronous lock protects stale callbacks and repeated resend/submit taps.
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    const request = generation.current;
    locked.current = true; setBusy(true); setError('');
    try { await operation(); }
    catch (failure) { if (request === generation.current) setError(errorMessage(failure)); }
    finally { if (request === generation.current) { locked.current = false; setBusy(false); } }
  };
  const requestCode = () => {
    if (locked.current || (step === 'code' && performance.now() < resendDeadline.current)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.'); return;
    }
    const request = generation.current;
    void run(async () => {
      await passwordResetApi.request(email);
      if (request !== generation.current) return;
      clearSensitive(); setStep('code');
      resendDeadline.current = performance.now() + 60000;
      setResendSeconds(60);
    });
  };
  const verifyCode = () => {
    if (locked.current) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return; }
    const request = generation.current;
    void run(async () => {
      const response = await passwordResetApi.verify(email, code);
      if (request !== generation.current) return;
      authorization.current = response.reset_token;
      setCode(''); setStep('password');
    });
  };
  const changePassword = () => {
    if (locked.current) return;
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmation) { setError('Passwords must match.'); return; }
    const request = generation.current;
    void run(async () => {
      try {
        await passwordResetApi.reset(email, authorization.current, password, confirmation);
        if (request !== generation.current) return;
        clearSensitive(); setEmail(''); setStep('success');
      } catch (failure) {
        if (request !== generation.current) return;
        if (failure instanceof ApiError && failure.fields.reset_token) {
          clearSensitive(); setStep('code');
        }
        throw failure;
      }
    });
  };
  const changeEmail = () => {
    if (locked.current) return;
    generation.current++; clearSensitive(); setError(''); setStep('email');
  };

  return <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Image accessibilityLabel="LifeFlow mascot" source={require('../../../assets/images/LogoMascot.png')} resizeMode="contain" style={styles.logo} />
          <Text style={styles.title}>{TITLES[step]}</Text>
          {step === 'email' ? <>
            <Text style={styles.body}>Enter the email associated with your LifeFlow account.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput accessibilityLabel="Email" autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address"
              maxLength={254} editable={!busy} value={email} onChangeText={setEmail} placeholder="Enter your email" placeholderTextColor="#766A68" style={styles.input} />
          </> : step === 'code' ? <>
            <Text style={styles.body}>{RESET_NOTICE}</Text>
            <Text style={styles.body}>Enter the 6-digit verification code sent to your email.</Text>
            <TextInput accessibilityLabel="6-digit code" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6}
              editable={!busy} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor="#766A68" style={styles.input} />
            <Text style={styles.body}>Code expires in 15 minutes.</Text>
          </> : step === 'password' ? <>
            <Text style={styles.body}>At least 8 characters. Passwords must match.</Text>
            <Text style={styles.label}>New password</Text>
            <TextInput accessibilityLabel="New password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
              maxLength={128} secureTextEntry={!showPassword} editable={!busy} value={password} onChangeText={setPassword} style={styles.input} />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput accessibilityLabel="Confirm new password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
              maxLength={128} secureTextEntry={!showPassword} editable={!busy} value={confirmation} onChangeText={setConfirmation} style={styles.input} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide passwords' : 'Show passwords'} disabled={busy}
              onPress={() => setShowPassword(value => !value)} style={styles.textButton}>
              <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} color="#766A68" size={22} />
              <Text style={styles.body}>{showPassword ? 'Hide passwords' : 'Show passwords'}</Text>
            </Pressable>
          </> : <Text style={styles.body}>Your password has been updated successfully.</Text>}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {step !== 'success' ? <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}}
            onPress={step === 'email' ? requestCode : step === 'code' ? verifyCode : changePassword}
            style={[styles.button, busy && styles.disabled]}>
            <Text style={styles.buttonText}>{busy ? 'Please wait...' : step === 'email' ? 'Send verification code' : step === 'code' ? 'Verify' : 'Change Password'}</Text>
          </Pressable> : null}
          {step === 'code' ? <>
            <Pressable accessibilityRole="button" disabled={busy || resendSeconds > 0} accessibilityState={{disabled:busy || resendSeconds > 0}}
              onPress={requestCode} style={styles.textButton}><Text style={styles.link}>{resendSeconds > 0 ? 'Resend code in ' + resendSeconds + 's' : 'Resend code'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={changeEmail} style={styles.textButton}><Text style={styles.link}>Change email</Text></Pressable>
          </> : null}
          <Pressable accessibilityRole="button" onPress={backToLogin} style={step === 'success' ? styles.button : styles.textButton}>
            <Text style={step === 'success' ? styles.buttonText : styles.link}>Back to Login</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  flex:{flex:1},safeArea:{flex:1,backgroundColor:'#FFF9F2'},
  scroll:{flexGrow:1,justifyContent:'center',paddingHorizontal:24,paddingVertical:28},
  content:{width:'100%',maxWidth:440,alignSelf:'center',gap:14},
  logo:{width:112,height:112,alignSelf:'center'},
  title:{color:'#D93A3A',fontSize:30,fontWeight:'800',textAlign:'center'},
  body:{color:'#766A68',fontSize:16,lineHeight:23},label:{color:'#372E2E',fontSize:15,fontWeight:'700'},
  input:{minHeight:54,paddingHorizontal:16,borderWidth:1,borderColor:'#E8DDD6',borderRadius:16,backgroundColor:'#FFFFFF',color:'#372E2E',fontSize:16},
  button:{minHeight:56,padding:12,alignItems:'center',justifyContent:'center',borderRadius:18,backgroundColor:'#D93A3A'},
  buttonText:{color:'#FFFFFF',fontSize:17,fontWeight:'700',textAlign:'center'},
  textButton:{minHeight:48,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},
  link:{color:'#D93A3A',fontSize:14,fontWeight:'700'},error:{color:'#C92A2A',fontSize:13,lineHeight:18},disabled:{opacity:0.5},
});

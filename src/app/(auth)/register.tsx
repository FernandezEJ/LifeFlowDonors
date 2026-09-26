import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { RegistrationLegal, PRESCREENING_ACKNOWLEDGEMENT } from '@/components/registration-legal';
import BirthDatePicker from '@/components/birth-date-picker';
import { authApi, formErrors } from '@/services/auth';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  border: '#E8DDD6',
  inputBackground: '#FFFFFF',
  error: '#C92A2A',
  selectedBackground: '#FDE7E3',
  white: '#FFFFFF',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const GENDERS = ['Male', 'Female'] as const;

type BloodType = (typeof BLOOD_TYPES)[number] | '';
type Gender = (typeof GENDERS)[number] | '';

type FormState = {
  acceptedTerms: boolean;
  acknowledgedPrivacy: boolean;
  acknowledgedPrescreening: boolean;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
  birthDate: string;
  gender: Gender;
  bloodType: BloodType;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  acceptedTerms: false, acknowledgedPrivacy: false, acknowledgedPrescreening: false,
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  mobileNumber: '',
  password: '',
  confirmPassword: '',
  birthDate: '',
  gender: '',
  bloodType: '',
};

function isValidBirthDate(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return false;
  }

  const [month, day, year] = value.split('/').map(Number);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  label: string;
};

function FormField({ children, error, label }: FormFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function RegisterScreen() {
  const router = useRouter();
  // ========================================
  // REGISTRATION STATE
  // Shares the root session and preserves field-level feedback.
  // ========================================
  const { register, verifyRegistration, busy: authBusy } = useAuth();
  const [requestError, setRequestError] = useState('');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [legalDocument, setLegalDocument] = useState<'terms' | 'privacy' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [working, setWorking] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const lock = useRef(false), generation = useRef(0), resendDeadline = useRef(0);
  const busy = authBusy || working;
  useFocusEffect(useCallback(() => () => {
    generation.current++; lock.current = false; setWorking(false);
    setPending(null); setCode(''); setLegalDocument(null);
    setForm(current => ({ ...current, password: '', confirmPassword: '', acceptedTerms: false, acknowledgedPrivacy: false, acknowledgedPrescreening: false }));
  }, []));
  useEffect(() => {
    const timer = setInterval(() => setResendSeconds(Math.max(0, Math.ceil((resendDeadline.current - performance.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);
  const startResendWait = () => { resendDeadline.current = performance.now() + 60000; setResendSeconds(60); };
  const changeEmail = () => {
    if (lock.current) return;
    generation.current++; setPending(null); setCode(''); setRequestError(''); setErrors({});
    setForm(current => ({ ...current, password: '', confirmPassword: '' }));
  };
  const verify = async () => {
    if (lock.current || !pending) return;
    if (!/^\d{6}$/.test(code)) { setRequestError('Enter the 6-digit code.'); return; }
    lock.current = true; setWorking(true); setRequestError('');
    const request = generation.current;
    try { await verifyRegistration(pending, code); }
    catch (error) {
      if (request === generation.current) setRequestError(errorMessage(error));
    } finally { if (request === generation.current) { lock.current = false; setWorking(false); } }
  };
  const resend = async () => {
    if (lock.current || !pending || performance.now() < resendDeadline.current) return;
    lock.current = true; setWorking(true); setRequestError('');
    const request = generation.current;
    try { await authApi.resendRegistration(pending); if (request === generation.current) { setCode(''); startResendWait(); } }
    catch (error) { if (request === generation.current) setRequestError(errorMessage(error)); }
    finally { if (request === generation.current) { lock.current = false; setWorking(false); } }
  };

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    if (lock.current) return;
    setForm((current) => ({ ...current, [field]: value }));

    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const formValidation = () => {
    const nextErrors: FormErrors = {};
    const normalizedMobile = form.mobileNumber.replace(/[\s()-]/g, '');

    if (!form.firstName.trim()) {
      nextErrors.firstName = 'First name is required.';
    }

    if (!form.lastName.trim()) {
      nextErrors.lastName = 'Last name is required.';
    }

    if (!form.email.trim()) {
      nextErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!form.mobileNumber.trim()) {
      nextErrors.mobileNumber = 'Mobile number is required.';
    } else if (!/^(?:\+63|0)9\d{9}$/.test(normalizedMobile)) {
      nextErrors.mobileNumber = 'Enter a valid Philippine mobile number.';
    }

    if (!form.password) {
      nextErrors.password = 'Password is required.';
    } else if (form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password.';
    } else if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    if (!form.birthDate.trim()) {
      nextErrors.birthDate = 'Birth date is required.';
    } else if (!isValidBirthDate(form.birthDate)) {
      nextErrors.birthDate = 'Enter a valid birth date in MM/DD/YYYY format.';
    }

    if (!form.gender) {
      nextErrors.gender = 'Select your gender.';
    }

    if (!form.bloodType) {
      nextErrors.bloodType = 'Select your blood type.';
    }

    if (form.firstName.trim().length > 80) nextErrors.firstName = 'Use at most 80 characters.';
    if (form.middleName.trim().length > 80) nextErrors.middleName = 'Use at most 80 characters.';
    if (form.lastName.trim().length > 80) nextErrors.lastName = 'Use at most 80 characters.';
    if (form.email.trim().length > 255) nextErrors.email = 'Use at most 255 characters.';
    const passwordBytes = Array.from(form.password).reduce((total, character) => { const point = character.codePointAt(0)!; return total + (point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4); }, 0);
    if (passwordBytes > 72 || form.password.includes('\0')) nextErrors.password = 'Use at most 72 bytes without null characters.';
    if (isValidBirthDate(form.birthDate)) {
      const [month, day, year] = form.birthDate.split('/').map(Number);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const birthday = new Date(); birthday.setHours(0, 0, 0, 0); birthday.setFullYear(year, month - 1, day);
      if (year < 1 || birthday >= today) nextErrors.birthDate = 'Choose a birth date before today.';
    }
    if (!form.acceptedTerms) nextErrors.acceptedTerms = 'Accept the Terms and Conditions.';
    if (!form.acknowledgedPrivacy) nextErrors.acknowledgedPrivacy = 'Acknowledge the Privacy Policy.';
    if (!form.acknowledgedPrescreening) nextErrors.acknowledgedPrescreening = 'Acknowledge the pre-screening limitation.';
    return nextErrors;
  };

  // ========================================
  // LARAVEL REGISTRATION
  // Requires complete form and consent before requesting the email code.
  // ========================================
  const handleCreateAccount = async () => {
    if (busy || lock.current) return;
    const validation = formValidation(); setErrors(validation);
    if (Object.keys(validation).length) return;
    lock.current = true; setWorking(true); setRequestError('');
    const request = generation.current;
    try {
      const response = await register(form);
      if (request !== generation.current) return;
      setPending(response.pending_token); setCode(''); startResendWait();
      setForm(current => ({ ...current, password: '', confirmPassword: '' }));
      setShowPassword(false); setShowConfirmPassword(false);
    } catch (error) {
      if (request === generation.current) { setErrors(formErrors(error)); setRequestError(errorMessage(error)); }
    } finally { if (request === generation.current) { lock.current = false; setWorking(false); } }
  };

  const canCreate = Object.keys(formValidation()).length === 0;

  if (pending) return <SafeAreaView style={styles.safeArea}>
    <View style={styles.decorativeCircle} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>We sent a 6-digit verification code to your email.</Text>
          </View>
          <View style={styles.form}>
            <FormField label="6-digit code">
              <TextInput accessibilityLabel="6-digit code" keyboardType="number-pad" autoComplete="one-time-code"
                maxLength={6} editable={!busy} value={code} onChangeText={setCode} style={styles.input} />
            </FormField>
            <Text style={styles.subtitle}>Code expires in 15 minutes.</Text>
          </View>
          <View style={styles.actions}>
            {requestError ? <Text accessibilityRole="alert" style={styles.errorText}>{requestError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={verify} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{busy ? 'Please wait...' : 'Verify & Create Account'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy || resendSeconds > 0} onPress={resend} style={{ padding: 16 }}>
              <Text style={styles.loginText}>{resendSeconds > 0 ? 'Resend code in ' + resendSeconds + 's' : 'Resend code'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={changeEmail} style={{ padding: 16 }}>
              <Text style={styles.loginText}>Change email</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.decorativeCircle} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Pressable
              accessibilityLabel="Back to onboarding"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.replace('/(auth)/onboarding2')}
              style={styles.backButton}>
              <MaterialIcons name="arrow-back" color={COLORS.text} size={22} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            <View style={styles.header}>
              <Text style={styles.title}>Create Your Account</Text>
              <Text style={styles.subtitle}>Join LifeFlow and start your donation journey.</Text>
            </View>

            <View style={styles.form}>
              <FormField label="First Name" error={errors.firstName}>
                <TextInput
                  autoCapitalize="words"
                  autoComplete="name-given"
                  onChangeText={(value) => updateField('firstName', value)}
                  placeholder="Enter your first name"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.firstName && styles.inputError]}
                  value={form.firstName}
                />
              </FormField>

              <FormField label="Middle Name" error={errors.middleName}>
                <TextInput
                  autoCapitalize="words"
                  autoComplete="name-middle"
                  onChangeText={(value) => updateField('middleName', value)}
                  placeholder="Enter your middle name"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                  value={form.middleName}
                />
              </FormField>

              <FormField label="Last Name" error={errors.lastName}>
                <TextInput
                  autoCapitalize="words"
                  autoComplete="name-family"
                  onChangeText={(value) => updateField('lastName', value)}
                  placeholder="Enter your last name"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.lastName && styles.inputError]}
                  value={form.lastName}
                />
              </FormField>

              <FormField label="Email Address" error={errors.email}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={(value) => updateField('email', value)}
                  placeholder="Enter your email"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.email && styles.inputError]}
                  value={form.email}
                />
              </FormField>

              <FormField label="Mobile Number" error={errors.mobileNumber}>
                <TextInput
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  maxLength={13}
                  onChangeText={(value) => updateField('mobileNumber', value)}
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.mobileNumber && styles.inputError]}
                  value={form.mobileNumber}
                />
              </FormField>

              <FormField label="Password" error={errors.password}>
                <View style={[styles.passwordInput, errors.password && styles.inputError]}>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={(value) => updateField('password', value)}
                    placeholder="Create a password"
                    placeholderTextColor={COLORS.muted}
                    secureTextEntry={!showPassword}
                    style={styles.passwordTextInput}
                    value={form.password}
                  />
                  <Pressable
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setShowPassword((visible) => !visible)}>
                    <MaterialIcons
                      color={COLORS.muted}
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={22}
                    />
                  </Pressable>
                </View>
              </FormField>

              <FormField label="Confirm Password" error={errors.confirmPassword}>
                <View style={[styles.passwordInput, errors.confirmPassword && styles.inputError]}>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={(value) => updateField('confirmPassword', value)}
                    placeholder="Confirm your password"
                    placeholderTextColor={COLORS.muted}
                    secureTextEntry={!showConfirmPassword}
                    style={styles.passwordTextInput}
                    value={form.confirmPassword}
                  />
                  <Pressable
                    accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setShowConfirmPassword((visible) => !visible)}>
                    <MaterialIcons
                      color={COLORS.muted}
                      name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                      size={22}
                    />
                  </Pressable>
                </View>
              </FormField>

              <FormField label="Birth Date" error={errors.birthDate}>
                <BirthDatePicker value={form.birthDate} disabled={busy} onChange={value => updateField('birthDate', value)} />
              </FormField>

              <FormField label="Gender" error={errors.gender}>
                <View style={styles.genderOptions}>
                  {GENDERS.map((gender) => {
                    const isSelected = form.gender === gender;

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        key={gender}
                        onPress={() => updateField('gender', gender)}
                        style={[
                          styles.selectionChip,
                          styles.genderChip,
                          isSelected && styles.selectionChipSelected,
                          errors.gender && styles.selectionError,
                        ]}>
                        <Text
                          style={[
                            styles.selectionText,
                            isSelected && styles.selectionTextSelected,
                          ]}>
                          {gender}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </FormField>

              <FormField label="Blood Type" error={errors.bloodType}>
                <View style={styles.bloodTypeOptions}>
                  {BLOOD_TYPES.map((bloodType) => {
                    const isSelected = form.bloodType === bloodType;

                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        key={bloodType}
                        onPress={() => updateField('bloodType', bloodType)}
                        style={[
                          styles.selectionChip,
                          styles.bloodTypeChip,
                          isSelected && styles.selectionChipSelected,
                          errors.bloodType && styles.selectionError,
                        ]}>
                        <Text
                          style={[
                            styles.selectionText,
                            isSelected && styles.selectionTextSelected,
                          ]}>
                          {bloodType}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </FormField>
            </View>


            {/* Links are outside checkbox press targets, so review never toggles consent. */}
            <View style={styles.consentGroup}>
              {([
                ['acceptedTerms', 'I agree to the Terms and Conditions', 'terms'],
                ['acknowledgedPrivacy', 'I acknowledge the Privacy Policy', 'privacy'],
                ['acknowledgedPrescreening', PRESCREENING_ACKNOWLEDGEMENT, null],
              ] as const).map(([field, label, document]) => <View key={field}>
                <View style={styles.consentRow}>
                  <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: form[field], disabled: busy }}
                    disabled={busy} onPress={() => updateField(field, !form[field])} style={styles.consentCheckbox}>
                    <MaterialIcons name={form[field] ? 'check-box' : 'check-box-outline-blank'} color={COLORS.brand} size={24} />
                  </Pressable>
                  <Text style={styles.consentText}>
                    {document ? <>
                      {document === 'terms' ? 'I agree to the ' : 'I acknowledge the '}
                      <Text accessibilityRole="link" accessibilityLabel={document === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
                        onPress={() => { if (!busy) setLegalDocument(document); }} style={styles.consentLink}>
                        {document === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
                      </Text>
                    </> : label}
                  </Text>
                </View>
                {errors[field] ? <Text style={styles.errorText}>{errors[field]}</Text> : null}
              </View>)}
            </View>
            <RegistrationLegal document={legalDocument} onClose={() => setLegalDocument(null)}
              onAgree={document => {
                updateField(document === 'terms' ? 'acceptedTerms' : 'acknowledgedPrivacy', true);
                setLegalDocument(null);
              }} />

            <View style={[styles.actions, styles.consentActions]}>
              {requestError ? <Text accessibilityRole="alert" style={styles.errorText}>{requestError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy || !canCreate}
                accessibilityState={{ disabled: busy || !canCreate, busy }}
                onPress={handleCreateAccount}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || !canCreate) && { opacity: 0.5 },
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>{busy ? 'Sending code...' : 'Create Account'}</Text>
              </Pressable>

              <View style={styles.loginRow}>
                <Text style={styles.accountText}>Already have an account?</Text>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => router.push('/(auth)/login')}>
                  <Text style={styles.loginText}>Login</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 36,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  decorativeCircle: {
    position: 'absolute',
    top: -100,
    right: -90,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#FDECE6',
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  backText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    marginTop: 14,
    marginBottom: 28,
  },
  title: {
    color: COLORS.brand,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    maxWidth: 350,
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 23,
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
  genderOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  bloodTypeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectionChip: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.inputBackground,
  },
  genderChip: {
    flex: 1,
  },
  bloodTypeChip: {
    minWidth: 68,
    flexGrow: 1,
    flexBasis: '21%',
  },
  selectionChipSelected: {
    borderColor: COLORS.brand,
    backgroundColor: COLORS.selectedBackground,
  },
  selectionError: {
    borderColor: COLORS.error,
  },
  selectionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  selectionTextSelected: {
    color: COLORS.brand,
    fontWeight: '800',
  },
  consentGroup: { marginTop: 16, gap: 0 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  consentCheckbox: { width: 44, minHeight: 44, alignItems: 'center', paddingTop: 9 },
  consentText: { flex: 1, paddingVertical: 10, fontSize: 15, lineHeight: 22, color: COLORS.text },
  consentLink: { color: COLORS.brand, fontWeight: '700', textDecorationLine: 'underline' },
  consentActions: { marginTop: 12, gap: 10 },
  actions: {
    gap: 16,
    marginTop: 30,
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
  loginRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  accountText: {
    color: COLORS.text,
    fontSize: 15,
  },
  loginText: {
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '700',
  },
});

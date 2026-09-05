import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
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

function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

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
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));

    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const validateForm = () => {
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

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateAccount = () => {
    if (!validateForm()) {
      return;
    }

    // TODO: Call the Laravel registration API here when backend integration begins.
    // Laravel integration requirements:
    // - Email and mobile number uniqueness will be validated by the Laravel backend.
    // - Registration must be rejected by the backend if either value already exists.
    // - Laravel must hash the password before storing it.
    // - The frontend must never decide email or mobile number uniqueness by itself.
    router.replace('/(tabs)');
  };

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

              <FormField label="Middle Name">
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
                <TextInput
                  keyboardType="number-pad"
                  maxLength={10}
                  onChangeText={(value) => updateField('birthDate', formatBirthDate(value))}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.birthDate && styles.inputError]}
                  value={form.birthDate}
                />
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

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleCreateAccount}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>Create Account</Text>
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

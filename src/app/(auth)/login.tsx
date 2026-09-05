import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Image,
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
  white: '#FFFFFF',
};

type LoginErrors = {
  identifier?: string;
  password?: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const updateIdentifier = (value: string) => {
    setIdentifier(value);

    if (errors.identifier) {
      setErrors((current) => ({ ...current, identifier: undefined }));
    }
  };

  const updatePassword = (value: string) => {
    setPassword(value);

    if (errors.password) {
      setErrors((current) => ({ ...current, password: undefined }));
    }
  };

  const validateForm = () => {
    const nextErrors: LoginErrors = {};

    if (!identifier.trim()) {
      nextErrors.identifier = 'Email or mobile number is required.';
    }

    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = () => {
    if (!validateForm()) {
      return;
    }

    // TODO: Call the Laravel login API here when backend authentication is connected.
    // Real login authentication will be handled by the Laravel backend.
    // Laravel should:
    // - Accept either an email address or mobile number as the login identifier.
    // - Find the matching user and verify the hashed password.
    // - Reject invalid credentials and return an authenticated user, session, or token on success.
    // - Never trust frontend validation alone.
    router.replace('/(tabs)');
  };

  const handleForgotPassword = () => {
    // TODO: Open the password recovery flow after that screen and backend support are added.
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.decorativeCircleTop} />
      <View style={styles.decorativeCircleBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Image
                accessibilityLabel="LifeFlow mascot"
                resizeMode="contain"
                source={require('../../../assets/images/LogoMascot.png')}
                style={styles.logo}
              />
              <Text style={styles.title}>Welcome to LifeFlow</Text>
              <Text style={styles.subtitle}>Sign in to continue your LifeFlow journey.</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email or Mobile Number</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={updateIdentifier}
                  placeholder="Enter your email or mobile number"
                  placeholderTextColor={COLORS.muted}
                  style={[styles.input, errors.identifier && styles.inputError]}
                  value={identifier}
                />
                {errors.identifier ? (
                  <Text style={styles.errorText}>{errors.identifier}</Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.passwordInput, errors.password && styles.inputError]}>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="current-password"
                    onChangeText={updatePassword}
                    onSubmitEditing={handleLogin}
                    placeholder="Enter your password"
                    placeholderTextColor={COLORS.muted}
                    returnKeyType="done"
                    secureTextEntry={!showPassword}
                    style={styles.passwordTextInput}
                    value={password}
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
                {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
              </View>

              <Pressable
                accessibilityRole="link"
                hitSlop={8}
                onPress={handleForgotPassword}
                style={styles.forgotButton}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleLogin}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>Login</Text>
              </Pressable>

              <View style={styles.registerRow}>
                <Text style={styles.accountText}>Don&apos;t have an account?</Text>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => router.push('/(auth)/register')}>
                  <Text style={styles.registerText}>Register</Text>
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

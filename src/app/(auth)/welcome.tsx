import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  white: '#FFFFFF',
};

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.decorativeCircleTop} />
      <View style={styles.decorativeCircleBottom} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image
              accessibilityLabel="LifeFlow Mascot"
              resizeMode="contain"
              source={require('../../../assets/images/LogoMascot.png')}
              style={styles.mascot}
            />

            <Text style={styles.title}>LifeFlow</Text>
            <Text style={styles.tagline}>Your blood, their future.</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/onboarding1')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
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
  gap: 24,
},

hero: {
  alignItems: 'center',
},

mascot: {
  width: 180,
  height: 180,
  alignSelf: 'center',
  marginBottom: 16,
},
  title: {
    color: COLORS.brand,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  tagline: {
    maxWidth: 310,
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
  },
  actions: {
    gap: 14,
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
});

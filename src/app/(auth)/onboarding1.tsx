import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  inactive: '#F0CBC6',
  white: '#FFFFFF',
};

export default function OnboardingOneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.decorativeCircleTop} />
      <View style={styles.decorativeCircleBottom} />

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <View accessibilityLabel="Page 1 of 2" style={styles.progress}>
              <View style={styles.progressActive} />
              <View style={styles.progressInactive} />
            </View>
          </View>

          <View style={styles.mainContent}>
            <Image
              accessibilityLabel="LifeFlow mascot"
              resizeMode="contain"
              source={require('../../../assets/images/Onboarding1.png')}
              style={styles.mascot}
            />
            <Text style={styles.title}>Be a Lifesaver</Text>
            <Text style={styles.description}>
              LifeFlow helps you stay ready to donate, discover blood donation activities, and make
              every donation count.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/onboarding2')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
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
  screen: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 24,
  },
  topBar: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  progressActive: {
    width: 28,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  progressInactive: {
    width: 10,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.inactive,
  },
  mainContent: {
    alignItems: 'center',
  },
  mascot: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  description: {
    maxWidth: 350,
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
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

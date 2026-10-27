import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const slides = [
  {
    mascot: require('../../assets/images/GreetMascot.png'),
    title: 'Be a Lifesaver',
    description: 'LifeFlow helps you stay ready to donate, discover blood donation activities, and make every donation count.',
    action: 'Next',
  },
  {
    mascot: require('../../assets/images/GoodMascot.png'),
    title: 'Your Donation Journey',
    description: 'Track your donation eligibility, join donation activities, earn Blood Points, and unlock rewards while helping save lives.',
    action: 'Create Account',
  },
] as const;

// Measure both slides at the actual available width and system text size. Each
// band can grow freely, but reserves the same space whichever slide is visible.
function TextBand({ variants, selected, textStyle, heading = false }: {
  variants: readonly string[];
  selected: number;
  textStyle: StyleProp<TextStyle>;
  heading?: boolean;
}) {
  const [heights, setHeights] = useState<number[]>(() => variants.map(() => 0));

  return (
    <View style={{ minHeight: Math.ceil(Math.max(0, ...heights)) }}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measurements}>
        {variants.map((text, index) => (
          <Text
            key={text}
            style={textStyle}
            onLayout={({ nativeEvent: { layout: { height } } }) => {
              setHeights(previous => {
                if (previous[index] === height) return previous;
                const next = [...previous];
                next[index] = height;
                return next;
              });
            }}>
            {text}
          </Text>
        ))}
      </View>
      <Text accessibilityRole={heading ? 'header' : undefined} style={textStyle}>
        {variants[selected]}
      </Text>
    </View>
  );
}

export function OnboardingScreen({ page, onNext }: { page: 1 | 2; onNext: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const selected = page - 1;
  const slide = slides[selected];
  // Discard measurements from a different viewport or accessibility text size.
  const measurementKey = `${width}:${fontScale}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.decorativeCircleTop} />
      <View pointerEvents="none" style={styles.decorativeCircleBottom} />
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.screen}>
          <View style={styles.topBar}>
            <View accessible accessibilityLabel={`Page ${page} of 2`} style={styles.progress}>
              {slides.map((item, index) => (
                <View key={item.title} style={index === selected ? styles.progressActive : styles.progressInactive} />
              ))}
            </View>
          </View>
          <View>
            <Image
              accessibilityLabel="LifeFlow mascot"
              resizeMode="contain"
              source={slide.mascot}
              style={styles.mascot}
            />
            <TextBand key={`${measurementKey}:title`} variants={slides.map(item => item.title)} selected={selected} textStyle={styles.title} heading />
            <View style={styles.descriptionBand}>
              <TextBand key={`${measurementKey}:description`} variants={slides.map(item => item.description)} selected={selected} textStyle={styles.description} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={slide.action}
            onPress={onNext}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <View style={styles.buttonLabel}>
              <TextBand key={`${measurementKey}:action`} variants={slides.map(item => item.action)} selected={selected} textStyle={styles.primaryButtonText} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PALETTE.cream, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  screen: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 24 },
  topBar: { alignItems: 'center', paddingVertical: 6 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  progressActive: { width: 28, height: 8, borderRadius: 4, backgroundColor: PALETTE.primary },
  progressInactive: { width: 10, height: 8, borderRadius: 4, backgroundColor: PALETTE.border },
  mascot: { width: 180, height: 180, alignSelf: 'center', marginBottom: 16 },
  title: { color: PALETTE.text, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  descriptionBand: { width: '100%', maxWidth: 350, alignSelf: 'center', marginTop: 12 },
  description: { color: PALETTE.neutral, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  measurements: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  primaryButton: {
    minHeight: 56, paddingHorizontal: 16, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', borderRadius: 18,
    backgroundColor: PALETTE.primary, shadowColor: PALETTE.primary,
    shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4,
  },
  buttonLabel: { width: '100%' },
  primaryButtonPressed: { backgroundColor: PALETTE.primaryPressed, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: PALETTE.surface, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  decorativeCircleTop: {
    position: 'absolute', top: -80, right: -90, width: 210, height: 210,
    borderRadius: 105, backgroundColor: PALETTE.decorativeTop,
  },
  decorativeCircleBottom: {
    position: 'absolute', bottom: -115, left: -100, width: 240, height: 240,
    borderRadius: 120, backgroundColor: PALETTE.decorativeBottom,
  },
});

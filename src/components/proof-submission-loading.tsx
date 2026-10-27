import { LifeFlowColors as COLORS } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACCENT = COLORS.primary;

export function ProofSubmissionLoading({ phase }: { phase: 'uploading' | 'checking' }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [trackWidth, setTrackWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let active = true, changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReducedMotion(value);
    }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true; setReducedMotion(value);
    });
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { active = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    if (reducedMotion || !foreground || trackWidth <= 0) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => { animation.stop(); progress.setValue(0); };
  }, [foreground, progress, reducedMotion, trackWidth]);

  const status = phase === 'checking' ? 'Confirming your submission...' : 'Submitting your donation proof...';
  const animate = !reducedMotion && foreground;
  return <Modal visible transparent animationType="none" onRequestClose={() => {}}>
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} accessibilityViewIsModal accessibilityState={{ busy: true }} style={styles.safeArea}>
      <ScrollView bounces={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <MaterialCommunityIcons name="send-outline" size={48} color={ACCENT} accessibilityRole="image" accessibilityLabel="Proof submission" />
          <View accessibilityRole="progressbar" accessibilityLabel={status} accessibilityState={{ busy: true }}
            accessibilityValue={{ text: 'Submission in progress' }} style={styles.track}
            onLayout={({ nativeEvent: { layout: { width } } }) => setTrackWidth(width)}>
            <Animated.View style={[styles.indicator, animate && trackWidth > 0 && {
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth * 0.4, trackWidth] }) }],
            }]} />
          </View>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.description}>{status}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  content: { width: '100%', maxWidth: 360, alignSelf: 'center', alignItems: 'center', gap: 18 },
  track: { width: '100%', maxWidth: 280, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.border },
  indicator: { width: '40%', height: '100%', borderRadius: 3, backgroundColor: ACCENT },
  description: { color: COLORS.neutralText, fontSize: 15, lineHeight: 23, textAlign: 'center' },
});

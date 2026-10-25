import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, View } from 'react-native';

type Variant = 'cards' | 'profile' | 'profile-fields' | 'profile-summary' | 'summary' | 'announcement' | 'activity' | 'detail' | 'status' | 'points' | 'transactions' | 'rewards' | 'notifications' | 'greeting' | 'my-rewards';

function Pulse({ children }: { children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let active = true, changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setReduced(value); });
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { active = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (reduced || !foreground) { opacity.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.6, duration: 1100, useNativeDriver: true, isInteraction: false }),
      Animated.timing(opacity, { toValue: 1, duration: 1100, useNativeDriver: true, isInteraction: false }),
    ]));
    animation.start();
    return () => { animation.stop(); opacity.setValue(1); };
  }, [foreground, opacity, reduced]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
function Lines() {
  return <><View style={[styles.block, { width: '65%', height: 18 }]} /><View style={[styles.block, { width: '90%', height: 13 }]} /><View style={[styles.block, { width: '75%', height: 13 }]} /></>;
}
function ScreenShape({ variant }: { variant: Exclude<Variant, 'cards'> }) {
  if (variant === 'greeting') return <View style={[styles.block, { width: 165, height: 29 }]} />;
  if (variant === 'notifications') return <>{[1, 2, 3].map(key => <View key={key} style={[styles.card, styles.row]}>
    <View style={[styles.block, { width: 40, height: 40 }]} /><View style={{ flex: 1 }}><Lines /><View style={[styles.block, { width: '30%', height: 12 }]} /></View>
    <View style={[styles.block, { width: 8, height: 8, borderRadius: 4 }]} /></View>)}</>;
  if (variant === 'activity' || variant === 'my-rewards') return <>{[1, 2].map(key => <View key={key} style={styles.card}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={[styles.block, { width: '65%', height: 20 }]} /><View style={[styles.block, { width: 16, height: 16 }]} /></View>
    <Lines /><View style={[styles.block, { width: '38%', height: 24, borderRadius: 14 }]} /></View>)}</>;
  if (variant === 'rewards') return <View style={[styles.row, { flexWrap: 'wrap' }]}>{[1, 2, 3, 4].map(key => <View key={key} style={[styles.card, { flexBasis: '45%', flexGrow: 1, minWidth: 120 }]}>
    <View style={[styles.block, { width: '100%', aspectRatio: 1 }]} /><Lines /></View>)}</View>;
  if (variant === 'profile-fields') return <View style={styles.card}>{[1, 2, 3, 4, 5, 6, 7, 8].map(key => <View key={key} style={{ paddingVertical: 8 }}>
    <View style={[styles.block, { width: '35%', height: 12 }]} /><View style={[styles.block, { width: '70%', height: 17 }]} /></View>)}</View>;
  if (variant === 'profile-summary') return <View style={styles.row}>{[1, 2].map(key => <View key={key} style={[styles.card, { flex: 1, minHeight: 134 }]}><Lines /></View>)}</View>;
  if (variant === 'profile') return <View style={{ alignItems: 'center' }}><View style={[styles.block, { width: 112, height: 112, borderRadius: 56 }]} /><View style={[styles.block, { width: '55%', height: 24 }]} /></View>;
  if (variant === 'points') return <View style={{ alignItems: 'center', paddingVertical: 18 }}>
    <View style={[styles.block, { width: 180, height: 180, borderRadius: 90 }]} /><View style={[styles.block, { width: 180, height: 46 }]} /></View>;
  if (variant === 'transactions') return <>{[1, 2, 3].map(key => <View key={key} style={[styles.card, styles.row]}><View style={{ flex: 1 }}><Lines /></View><View style={[styles.block, { width: 42, height: 22 }]} /></View>)}</>;
  if (variant === 'status') return <><View style={[styles.card, styles.row]}><View style={[styles.block, { width: 88, height: 110 }]} /><View style={{ flex: 1 }}><Lines /></View></View>
    <View style={styles.row}>{[1, 2].map(key => <View key={key} style={[styles.card, { flex: 1 }]}><Lines /></View>)}</View></>;
  return <View style={styles.card}>
    <View style={[styles.block, { width: '100%', aspectRatio: 16 / 9 }]} /><Lines />
    {variant === 'detail' ? <><View style={[styles.block, { height: 100 }]} /><Lines /></> : null}
  </View>;
}

export function TabSkeleton({ variant = 'cards', label = 'Loading content' }: {
  variant?: Variant; label?: string;
}) {
  // Flowie's default placeholder retains its exact static structure and measured geometry.
  if (variant !== 'cards') return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ width: '100%' }}>
    <Pulse><View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><ScreenShape variant={variant} /></View></Pulse>
  </View>;
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={[styles.container, false]}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.block, { width: '55%', height: 22, alignSelf: 'flex-start' }]} />
      <View style={[styles.block, { height: 160 }]} />
      {[1, 2, 3].map(key => <View key={key} style={styles.card}><View style={[styles.block, { width: '65%', height: 16 }]} /><View style={[styles.block, { width: '90%', height: 12 }]} /></View>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16, width: '100%' }, block: { borderRadius: 12, backgroundColor: PALETTE.border, marginBottom: 14 }, card: { borderRadius: 18, backgroundColor: PALETTE.surface, padding: 18, marginBottom: 14 }, row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } });

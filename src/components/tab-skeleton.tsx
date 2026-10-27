import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, View } from 'react-native';

type Variant = 'cards' | 'profile' | 'profile-fields' | 'profile-summary' | 'summary' | 'announcement' | 'activity' | 'activity-detail' | 'detail' | 'status' | 'points' | 'reward-balance' | 'transactions' | 'rewards' | 'notifications' | 'greeting' | 'my-rewards';

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
  if (variant === 'activity-detail') return <>
    <View style={[styles.card, styles.row]}><View style={[styles.block, { width: 48, height: 48, borderRadius: 24 }]} /><View style={{ flex: 1 }}><Lines /></View></View>
    <View style={styles.card}>
      <View style={styles.row}><View style={[styles.block, { width: 44, height: 44, borderRadius: 22 }]} /><View style={[styles.block, { flex: 1, height: 30 }]} /></View>
      {[1, 2].map(key => <View key={key} style={[styles.row, { marginTop: 16 }]}><View style={[styles.block, { width: 25, height: 25 }]} /><View style={{ flex: 1 }}><View style={[styles.block, { width: '30%', height: 13 }]} /><View style={[styles.block, { width: '75%', height: 23 }]} /></View></View>)}
      <View style={{ borderTopWidth: 1, borderTopColor: PALETTE.border, paddingTop: 16, marginTop: 8 }}><Lines /><Lines /></View>
    </View>
    <View style={[styles.card, styles.row]}><View style={[styles.block, { width: 44, height: 44, borderRadius: 22 }]} /><View style={{ flex: 1 }}><Lines /><View style={[styles.block, { width: '90%', height: 13 }]} /></View></View>
    <View style={styles.card}><View style={styles.row}><View style={[styles.block, { width: 44, height: 44, borderRadius: 22 }]} /><View style={{ flex: 1 }}><Lines /></View></View><Lines /></View>
  </>;
  if (variant === 'activity') return <>{[1, 2, 3].map(key => <View key={key} style={styles.card}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={[styles.block, { width: '65%', height: 20 }]} /><View style={[styles.block, { width: 16, height: 16 }]} /></View>
    <View style={[styles.block, { width: '42%', height: 14 }]} /><View style={[styles.block, { width: '75%', height: 14 }]} />
    <View style={[styles.block, { width: '38%', height: 24, borderRadius: 14 }]} /><View style={[styles.block, { width: '85%', height: 13, marginBottom: 0 }]} />
  </View>)}</>;
  if (variant === 'my-rewards') return <>{[1, 2].map(key => <View key={key} style={styles.card}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={[styles.block, { width: '65%', height: 20 }]} /><View style={[styles.block, { width: 16, height: 16 }]} /></View>
    <Lines /><View style={[styles.block, { width: '38%', height: 24, borderRadius: 14 }]} /></View>)}</>;
  if (variant === 'rewards') return <View style={{ marginTop: 16 }}>{[1, 2, 3].map(key => <View key={key} style={[styles.card, styles.row, { width: '100%', borderRadius: 20, padding: 13 }]}>
    <View style={[styles.block, { width: 76, height: 96, marginBottom: 0 }]} /><View style={{ flex: 1, minWidth: 0 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><View style={[styles.block, { width: '70%', height: 19 }]} /><View style={[styles.block, { width: 16, height: 16 }]} /></View>
      <View style={[styles.block, { width: '85%', height: 13 }]} /><View style={[styles.block, { width: '48%', height: 17 }]} /><View style={[styles.block, { width: '55%', height: 12, marginBottom: 0 }]} />
    </View></View>)}</View>;
  if (variant === 'profile-fields') return <View style={styles.card}>{[1, 2, 3, 4, 5, 6, 7, 8].map(key => <View key={key} style={{ paddingVertical: 8 }}>
    <View style={[styles.block, { width: '35%', height: 12 }]} /><View style={[styles.block, { width: '70%', height: 17 }]} /></View>)}</View>;
  if (variant === 'profile-summary') return <View style={styles.row}>{[1, 2].map(key => <View key={key} style={[styles.card, { flex: 1, minHeight: 134 }]}><Lines /></View>)}</View>;
  if (variant === 'profile') return <View style={{ alignItems: 'center' }}><View style={[styles.block, { width: 112, height: 112, borderRadius: 56 }]} /><View style={[styles.block, { width: '55%', height: 24 }]} /></View>;
  if (variant === 'points' || variant === 'reward-balance') return <View style={{ width: '100%', alignItems: 'center' }}>
    <View style={{ width: 154, height: 154, borderRadius: 77, borderWidth: 4, borderColor: PALETTE.border, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 17, backgroundColor: PALETTE.surface }}>
      <View style={[styles.block, { width: 62, height: 34, marginBottom: 8 }]} /><View style={[styles.block, { width: 80, height: 13, marginBottom: 0 }]} />
    </View>
    {variant === 'points' ? <View style={[styles.row, { width: '100%', flexWrap: 'wrap', marginTop: 18 }]}>{[1, 2].map(key => <View key={key} style={[styles.block, { flexBasis: 130, flexGrow: 1, minHeight: 50, borderRadius: 16, marginBottom: 0 }]} />)}</View> : null}
  </View>;
  if (variant === 'transactions') return <View style={{ marginTop: 13 }}>{[1, 2, 3].map(key => <View key={key} style={[styles.card, styles.row, { alignItems: 'center', minHeight: 76, borderRadius: 17, paddingVertical: 13, paddingLeft: 0, paddingRight: 15, marginBottom: 10 }]}>
    <View style={[styles.block, { width: 5, height: 36, borderRadius: 3, marginBottom: 0 }]} /><View style={{ flex: 1 }}><View style={[styles.block, { width: '75%', height: 15, marginBottom: 8 }]} /><View style={[styles.block, { width: '48%', height: 12, marginBottom: 0 }]} /></View><View style={[styles.block, { width: 58, height: 22, marginBottom: 0 }]} />
  </View>)}</View>;
  if (variant === 'status') return <><View style={[styles.card, styles.row]}><View style={[styles.block, { width: 88, height: 110 }]} /><View style={{ flex: 1 }}><Lines /></View></View>
    <View style={styles.row}>{[1, 2].map(key => <View key={key} style={[styles.card, { flex: 1 }]}><Lines /></View>)}</View></>;
  return <View style={styles.card}>
    <View style={[styles.block, { width: '100%', aspectRatio: 16 / 9 }]} /><Lines />
    {variant === 'detail' ? <><View style={[styles.block, { height: 100 }]} /><Lines /></> : null}
  </View>;
}

export function TabSkeleton({ variant = 'cards', label = 'Loading content', colors, pulse = false }: {
  variant?: Variant; label?: string; colors?: { surface: string; block: string }; pulse?: boolean;
}) {
  // Preserve Flowie's measured geometry; callers can reuse the same gentle pulse.
  if (variant !== 'cards') return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ width: '100%' }}>
    <Pulse><View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><ScreenShape variant={variant} /></View></Pulse>
  </View>;
  const block = colors ? { ...styles.block, backgroundColor: colors.block } : styles.block;
  const card = colors ? { ...styles.card, backgroundColor: colors.surface } : styles.card;
  const content = <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[block, { width: '55%', height: 22, alignSelf: 'flex-start' }]} />
      <View style={[block, { height: 160 }]} />
      {[1, 2, 3].map(key => <View key={key} style={card}><View style={[block, { width: '65%', height: 16 }]} /><View style={[block, { width: '90%', height: 12 }]} /></View>)}
    </View>;
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} style={[styles.container, false]}>
    {pulse ? <Pulse>{content}</Pulse> : content}
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16, width: '100%' }, block: { borderRadius: 12, backgroundColor: PALETTE.skeleton, marginBottom: 14 }, card: { borderRadius: 18, backgroundColor: PALETTE.surface, padding: 18, marginBottom: 14 }, row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } });

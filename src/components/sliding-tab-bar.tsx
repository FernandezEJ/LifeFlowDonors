import { LifeFlowColors as COLORS } from '@/constants/theme';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, I18nManager, StyleSheet, View } from 'react-native';

type BackgroundProps = { index: number; count: number; horizontalInset: number };

// Stay inside the navigator's background layer so its native buttons, guards,
// keyboard handling and accessibility semantics remain in charge.
export function SlidingTabBar(props: BottomTabBarProps) {
  const route = props.state.routes[props.state.index];
  const descriptor = props.descriptors[route.key];
  return <BottomTabBar {...props} descriptors={{
    ...props.descriptors,
    [route.key]: { ...descriptor, options: { ...descriptor.options,
      tabBarBackground: () => <SlidingTabBackground index={props.state.index}
        count={props.state.routes.length} horizontalInset={Math.max(props.insets.left, props.insets.right)} />,
    } },
  }} />;
}

export function SlidingTabBackground({ index, count, horizontalInset }: BackgroundProps) {
  const [width, setWidth] = useState(0);
  // Avoid motion until the platform accessibility preference has resolved.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [translateX] = useState(() => new Animated.Value(0));
  const previous = useRef<{ geometry: string; target: number } | null>(null);
  const slot = Math.max(0, width - horizontalInset * 2) / Math.max(1, count);
  const pillWidth = Math.max(0, Math.min(44, slot - 8));
  const visualIndex = I18nManager.isRTL ? count - 1 - index : index;
  const target = horizontalInset + slot * (visualIndex + 0.5) - pillWidth / 2;
  const geometry = `${width}:${count}:${horizontalInset}:${I18nManager.isRTL}`;

  useEffect(() => {
    let active = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      changed = true;
      if (active) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active && !changed) setReduceMotion(enabled);
    }).catch(() => { /* Keep the motion-free fallback if the platform cannot report it. */ });
    return () => { active = false; listener.remove(); };
  }, []);

  useLayoutEffect(() => {
    if (!width) return;
    const last = previous.current;
    previous.current = { geometry, target };
    if (reduceMotion || !last || last.geometry !== geometry) {
      translateX.stopAnimation();
      translateX.setValue(target);
      return;
    }
    if (last.target === target) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;
    // Read the native visual position after stopping, rather than measuring
    // from the previous destination when a donor quickly changes direction.
    translateX.stopAnimation(position => {
      if (cancelled) return;
      const distance = Math.abs(target - position) / slot;
      if (distance < 0.01) {
        translateX.setValue(target);
        return;
      }
      animation = Animated.timing(translateX, {
        toValue: target,
        // 220 ms for a neighbor, up to 400 ms for a full four-tab crossing.
        duration: Math.round(220 + 60 * Math.min(3, Math.max(0, distance - 1))),
        easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false,
      });
      animation.start();
    });
    return () => { cancelled = true; animation?.stop(); };
  }, [geometry, target, slot, width, reduceMotion, translateX]);

  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.background}>
    <Animated.View style={[styles.pill, { width: pillWidth, opacity: width ? 1 : 0, transform: [{ translateX }] }]} />
  </View>;
}

const styles = StyleSheet.create({
  background: { flex: 1, direction: 'ltr', backgroundColor: COLORS.cream },
  pill: { position: 'absolute', left: 0, top: 10, height: 30, borderRadius: 15, backgroundColor: COLORS.pastelPink },
});

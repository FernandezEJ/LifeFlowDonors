import { LifeFlowColors as COLORS } from '@/constants/theme';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Philippine Red Cross National Blood Services: donate-blood preparation guidance.
// https://sites.google.com/redcross.org.ph/prcnationalbloodservices/donate-blood
const TIPS = [
  'Get enough rest before donating.',
  "Eat a balanced, iron-rich meal; don’t fast.",
  'Drink plenty of water.',
  'Avoid alcohol for at least 24 hours beforehand.',
  'Avoid smoking for at least one hour beforehand.',
  'Bring a valid photo ID and wear sleeves that roll up easily.',
];

type Props = { visible: boolean; busy: boolean; error?: string | null;
  onFlowie: () => void; onAcknowledge: () => void; onBack: () => void };
export function DonationPreparationModal({ visible, busy, error, onFlowie, onAcknowledge, onBack }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [innerWidth, setInnerWidth] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const availableWidth = Math.max(0, Math.min(400, width - insets.left - insets.right - 32) - 24);
  const maxCardHeight = Math.max(0, Math.floor((height - insets.top - insets.bottom - 32) * 0.9));
  const footerReserve = footerHeight || 2 * Math.max(48, 20 * fontScale + 20) + 24;
  // Both dimensions must override Image's intrinsic 1200x900 static-asset size.
  // On short landscape screens, scale the complete poster down to fit above the footer.
  const posterWidth = Math.min(innerWidth || availableWidth, availableWidth, Math.max(0, maxCardHeight - footerReserve - 24) * 4 / 3);
  const posterSize = { width: posterWidth, height: posterWidth * 3 / 4 };
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => { if (!busy) onBack(); }}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.overlay}>
      <View accessibilityViewIsModal onAccessibilityEscape={() => { if (!busy) onBack(); }} style={[styles.card, { maxHeight: maxCardHeight }]}>
        <ScrollView bounces={false} contentContainerStyle={styles.content} style={styles.scroll}>
          <View onLayout={event => setInnerWidth(event.nativeEvent.layout.width)} style={styles.imageArea}>
            <View style={[styles.posterFrame, posterSize]}>
              <Image source={require('../../assets/images/DonationPreparationPoster.png')} resizeMode="contain"
                accessibilityLabel="Flowie donation preparation: rest, balanced meals, water, and avoiding alcohol and smoking"
                style={[styles.poster, posterSize]} />
            </View>
          </View>
          <Text style={styles.description}>Your blood donation is tomorrow. Here are a few ways to prepare.</Text>
          {TIPS.map(tip => <Text key={tip} style={styles.tip}>{'• ' + tip}</Text>)}
          <Text style={styles.note}>Follow your organizer’s advice. Healthcare staff make the final donation eligibility decision.</Text>
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View onLayout={event => setFooterHeight(event.nativeEvent.layout.height)} style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Prepare with Flowie" disabled={busy}
            accessibilityState={{ disabled: busy, busy }} onPress={onFlowie} style={[styles.button, styles.primary, busy && styles.disabled]}>
            <Text style={styles.primaryText}>Prepare with Flowie</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Got it" disabled={busy}
            accessibilityState={{ disabled: busy, busy }} onPress={onAcknowledge} style={[styles.button, busy && styles.disabled]}>
            <Text style={styles.secondaryText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: COLORS.backdrop },
  card: { width: '100%', maxWidth: 400, borderRadius: 22, backgroundColor: COLORS.cream, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 }, content: { padding: 12, gap: 6 },
  imageArea: { alignSelf: 'stretch', alignItems: 'center', minWidth: 0 },
  posterFrame: { borderRadius: 12, overflow: 'hidden' }, poster: { aspectRatio: 4 / 3 },
  description: { fontSize: 14, lineHeight: 20, color: COLORS.text },
  tip: { fontSize: 13, lineHeight: 19, color: COLORS.text },
  note: { fontSize: 11, lineHeight: 16, color: COLORS.neutral },
  error: { color: COLORS.danger, fontSize: 14, lineHeight: 21 },
  actions: { flexShrink: 0, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, gap: 4 },
  button: { minHeight: 48, borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: COLORS.primary }, primaryText: { color: COLORS.onPrimary, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  secondaryText: { color: COLORS.primary, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.6 },
});

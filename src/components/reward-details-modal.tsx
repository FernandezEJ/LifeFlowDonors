import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLayoutEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LifeFlowColors as COLORS } from '@/constants/theme';
import { publicImageUrl } from '@/services/announcement-presentation';
import { hasVoucherValue, type Reward } from '@/services/rewards';

export function RewardImage({ reward, large = false }: { reward: Reward; large?: boolean }) {
  const uri = publicImageUrl(reward.image_url, 'rewards');
  const [failed, setFailed] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ uri: string; ratio: number } | null>(null);
  const currentUri = useRef(uri);
  useLayoutEffect(() => { currentUri.current = uri; }, [uri]);
  const ratio = dimensions?.uri === uri ? dimensions.ratio : null;
  const frameRatio = 76 / 96;
  // Fill normal thumbnails. Keep unusually wide/tall artwork complete rather
  // than cropping away more than a quarter of the product; details stay full-size.
  const excessiveCrop = ratio !== null && Math.min(ratio / frameRatio, frameRatio / ratio) < 0.75;
  return <View style={[styles.imageFrame, large && styles.largeImage]}>
    {uri && failed !== uri ? <Image source={{ uri }} resizeMode={large || excessiveCrop ? 'contain' : 'cover'} style={styles.image}
      accessibilityLabel={reward.name}
      onLoad={event => {
        if (currentUri.current !== uri) return;
        const { width, height } = event.nativeEvent.source;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setDimensions({ uri, ratio: width / height });
        }
      }}
      onError={() => { if (currentUri.current === uri) setFailed(uri); }} /> :
      <MaterialIcons name="card-giftcard" size={large ? 64 : 40} color={COLORS.primary}
        accessibilityLabel="Reward image unavailable" />}
  </View>;
}

type Props = {
  reward: Reward | null; balance: number | null; variantId?: number; busy: boolean; reason: string;
  selectionDisabled: boolean; onSelectVariant: (id: number) => void; onClose: () => void; onRedeem: () => void;
};

export function RewardDetailsModal({ reward, balance, variantId, busy, reason, selectionDisabled, onSelectVariant, onClose, onRedeem }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const dismiss = () => { if (!busy) onClose(); };
  return <Modal visible={!!reward} transparent animationType="fade" onRequestClose={dismiss}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
      <View accessibilityViewIsModal onAccessibilityEscape={dismiss} style={styles.dialog}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.heading}>Reward Details</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close reward details" disabled={busy}
            accessibilityState={{ disabled: busy }} onPress={dismiss} style={styles.close}>
            <MaterialIcons name="close" size={22} color={COLORS.primary} accessible={false} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
          {reward ? <>
            <RewardImage reward={reward} large />
            <Text style={styles.name}>{reward.name}</Text>
            {reward.category ? <Text style={styles.category}>{reward.category}</Text> : null}
            <Text style={styles.points}>{Number.isFinite(reward.points_cost) ? reward.points_cost : 'Unavailable'} Blood Points</Text>
            <Text style={styles.detail}>Your balance: {balance ?? 'Unavailable'} Blood Points</Text>
            {hasVoucherValue(reward) ? <Text style={styles.detail}>Voucher Value: ₱{reward.voucher_value}</Text> : null}
            {Number.isFinite(reward.stock_quantity) ? <Text style={styles.detail}>{reward.stock_quantity} remaining</Text> : null}
            {reward.description ? <Text style={styles.description}>{reward.description}</Text> : null}
            {reward.category === 'apparel' ? <View style={styles.sizes}>
              <Text style={styles.sizeHeading}>Choose your size</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel={`Size for ${reward.name}`} style={styles.sizeChoices}>
                {reward.variants?.filter(row => row.enabled).map(row => {
                  const available = Number.isFinite(row.stock_quantity) && row.stock_quantity > 0;
                  const disabled = selectionDisabled || !available;
                  const selected = available && row.id === variantId;
                  return <Pressable key={row.id} accessibilityRole="radio"
                    accessibilityLabel={`Size ${row.size}, ${available ? row.stock_quantity + ' remaining' : 'sold out'}`}
                    accessibilityState={{ selected, disabled }} disabled={disabled}
                    onPress={() => { if (!disabled) onSelectVariant(row.id); }}
                    style={[styles.sizeChip, selected && styles.sizeSelected, disabled && styles.disabled]}>
                    <Text style={styles.detail}>{row.size}{available ? ` (${row.stock_quantity})` : ' — Sold out'}</Text>
                  </Pressable>;
                })}
              </View>
            </View> : null}
            {reason ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.reason}>{reason}</Text> : null}
            <Text style={styles.guidance}>Your reward will be saved in My Rewards. Activate its claim code when you are ready. Staff confirm your claim when you receive the item.</Text>
            <View style={[styles.actions, stacked && styles.actionsStacked]}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" accessibilityState={{ disabled: busy }}
                disabled={busy} onPress={dismiss} style={[styles.button, stacked && styles.stackedButton, styles.secondary, busy && styles.disabled]}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Redeeming reward' : 'Redeem'}
                accessibilityState={{ disabled: busy || !!reason, busy }} disabled={busy || !!reason}
                onPress={() => { if (!busy && !reason) onRedeem(); }}
                style={[styles.button, stacked && styles.stackedButton, styles.primary, (busy || !!reason) && styles.disabled]}>
                <Text style={styles.primaryText}>{busy ? 'Redeeming...' : 'Redeem'}</Text>
              </Pressable>
            </View>
          </> : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: COLORS.backdrop },
  dialog: { width: '100%', maxWidth: 420, maxHeight: '100%', borderRadius: 24, backgroundColor: COLORS.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, paddingRight: 8, paddingVertical: 8, },
  heading: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 27, fontWeight: '700', color: COLORS.text },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 }, content: { padding: 20, gap: 8 },
  imageFrame: { width: 76, height: 96, borderRadius: 12, backgroundColor: COLORS.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  largeImage: { width: '100%', height: 180, marginBottom: 4 }, image: { width: '100%', height: '100%' },
  name: { color: COLORS.text, fontSize: 20, lineHeight: 27, fontWeight: '800' },
  category: { color: COLORS.neutralText, fontSize: 13, textTransform: 'capitalize' },
  points: { color: COLORS.primary, fontSize: 18, lineHeight: 25, fontWeight: '800' },
  detail: { color: COLORS.neutralText, fontSize: 13, lineHeight: 20 },
  description: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  sizes: { gap: 8, marginTop: 8 }, sizeHeading: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sizeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.controlBorder, borderRadius: 10, padding: 10 },
  sizeSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.selected },
  reason: { color: COLORS.danger, fontSize: 14, lineHeight: 21, marginTop: 8 },
  guidance: { color: COLORS.neutral, fontSize: 12, lineHeight: 18, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 }, actionsStacked: { flexDirection: 'column' },
  button: { flexGrow: 1, flexBasis: 0, minHeight: 48, minWidth: 0, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  stackedButton: { flexGrow: 0, flexBasis: 'auto' },
  secondary: { borderWidth: 1, borderColor: COLORS.border }, primary: { backgroundColor: COLORS.primary },
  secondaryText: { color: COLORS.neutralText, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  primaryText: { color: COLORS.surface, textAlign: 'center', fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.5 },
});

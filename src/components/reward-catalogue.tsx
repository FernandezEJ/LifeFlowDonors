import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { ConfirmationModal } from '@/components/confirmation-modal';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import { publicImageUrl } from '@/services/announcement-presentation';
import { redemptionStorage, type PendingRedemption } from '@/services/redemption-storage';
import { hasVoucherValue, REWARD_CATEGORIES, type PointSummary, type Reward } from '@/services/rewards';
const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  brandPressed: PALETTE.primaryPressed,
  text: PALETTE.text,
  muted: PALETTE.neutral,
  border: PALETTE.border,
  white: PALETTE.surface,
  softRed: PALETTE.selected,
};


// ========================================
// SHARED REAL REWARD CATALOGUE
// Real inventory and balance in the dedicated Redeem destination.
// Focus refreshes prices, stock and balance; old session responses are discarded.
// ========================================
export function RewardCatalogue({ showBalance = false, onBalance }: { showBalance?: boolean; onBalance?: (balance: number) => void }) {
  const { user, rewards, pointsSummary, redeemReward } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Reward[]>([]);
  const [category, setCategory] = useState('all');
  const [selectedSizes, setSelectedSizes] = useState<Record<number, number>>({});
  const categories = ['all', ...REWARD_CATEGORIES];
  const visibleItems = items.filter(item => category === 'all' || item.category === category);
  const [summary, setSummary] = useState<PointSummary | null>(null);
  const [pending, setPending] = useState<PendingRedemption | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ reward: Reward; attempt: PendingRedemption } | null>(null);
  const requestKey = useRef('');
  const lock = useRef(false);
  const submitted = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const [catalogue, balance, saved] = await Promise.all([rewards(), pointsSummary(), user ? redemptionStorage.read(user.id) : null]);
      if (current !== generation.current) return;
      setItems(catalogue.data); requestKey.current = catalogue.request_key;
      setSummary(balance); onBalance?.(balance.current_balance); setPending(saved);
    } catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [rewards, pointsSummary, user, onBalance]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));

  // ========================================
  // CONFIRMED, PERSISTENT AND IDEMPOTENT SPENDING
  // Save the request key before sending. Uncertain failures retain it, including
  // after restart. A synchronous lock blocks both duplicate dialogs and taps.
  // ========================================
  const spend = async (attempt: PendingRedemption) => {
    if (submitted.current) return;
    if (!user) { lock.current = false; return; }
    submitted.current = true;
    const current = generation.current;
    setBusy(true); setError('');
    try {
      await redemptionStorage.save(user.id, attempt);
      setPending(attempt);
      const result = await redeemReward(attempt.rewardId, attempt.requestKey, attempt.variantId);
      await redemptionStorage.clear(user.id);
      if (current !== generation.current) return;
      setSummary(result.summary); onBalance?.(result.summary.current_balance);
      setItems(list => list.map(item => item.id === result.reward.id ? result.reward : item));
      setPending(null);
      router.navigate('/my-vouchers');
    } catch (cause) {
      if (current !== generation.current) return;
      if (cause instanceof ApiError && [404, 422].includes(cause.status)) {
        await redemptionStorage.clear(user.id).catch(() => undefined);
        setPending(null);
      }
      setError(errorMessage(cause));
    } finally { submitted.current = false; lock.current = false; setBusy(false); setConfirmation(null); }
  };
  const confirm = (reward: Reward) => {
    if (lock.current || loading || pending || !summary || reward.stock_quantity < 1 || summary.current_balance < reward.points_cost) return;
    const variant = reward.variants?.find(row => row.id === selectedSizes[reward.id] && row.enabled && row.stock_quantity > 0);
    if (reward.category === 'apparel' && !variant) { setError('Choose an available size before redeeming.'); return; }
    lock.current = true;
    setConfirmation({ reward, attempt: { rewardId: reward.id, requestKey: requestKey.current, ...(variant ? { variantId: variant.id } : {}) } });
  };

  // ========================================
  // CATALOGUE STATES AND FINITE STOCK
  // No sample rewards or optimistic balance changes are displayed.
  // A pending retry remains available even when its previous purchase used the last unit.
  // ========================================
  if (loading && !summary) return <TabSkeleton />;
  return <View>
    <ConfirmationModal visible={!!confirmation} icon="card-giftcard" title="Confirm Redemption"
      message={confirmation ? `${confirmation.reward.name}${confirmation.attempt.variantId ? ' — Size ' + confirmation.reward.variants?.find(row => row.id === confirmation.attempt.variantId)?.size : ''}${hasVoucherValue(confirmation.reward) ? ' — ₱' + confirmation.reward.voucher_value : ''}\nRedeem this reward for ${confirmation.reward.points_cost} points?\nYour reward will be saved in My Rewards. Activate its claim code when you are ready. Staff confirm your claim when you receive the item.` : ''}
      primaryLabel="Redeem" secondaryLabel="Cancel" variant="warning" loading={busy}
      onSecondary={() => { if (!submitted.current) { lock.current = false; setConfirmation(null); } }}
      onPrimary={async () => { if (confirmation && lock.current) await spend(confirmation.attempt); }} />
    {showBalance ? <View style={styles.balanceSection}><Text style={styles.balanceHeading}>Your Blood Points</Text>
      <View style={styles.pointsCircle}><Text style={styles.pointsNumber}>{summary?.current_balance ?? '--'}</Text><Text style={styles.pointsLabel}>Points</Text></View></View> : null}
    <View style={styles.rewardsHeader}><Text style={styles.rewardsHeading}>Available Rewards</Text>
      <Pressable onPress={() => router.navigate('/my-vouchers')} style={styles.myVouchersButton}><Text style={styles.myVouchersText}>My Rewards</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Reward category"
      style={styles.categoryFilter} contentContainerStyle={styles.filters}>
      {categories.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: category === value, disabled: busy }}
        disabled={busy} hitSlop={{ top: 2, bottom: 2 }} onPress={() => setCategory(value)}
        style={[styles.filterChip, category === value && styles.filterChipSelected, busy && styles.filterDisabled]}>
        <Text style={[styles.filterText, category === value && styles.filterTextSelected]}>{value === 'all' ? 'All Categories' : value[0].toUpperCase() + value.slice(1)}</Text>
      </Pressable>)}
    </ScrollView>
    {error ? <View><Text accessibilityRole="alert" style={{color:PALETTE.danger}}>{error}</Text><Pressable accessibilityRole="button" disabled={busy || loading || !!confirmation} onPress={() => void refresh()} style={styles.refreshButton}><Text style={styles.myVouchersText}>Retry</Text></Pressable></View> : null}
    {pending ? <Pressable disabled={busy} style={styles.myVouchersButton} onPress={() => { if (!lock.current) { lock.current = true; void spend(pending); } }}>
      <Text style={styles.myVouchersText}>{busy ? 'Submitting...' : 'Retry pending redemption'}</Text></Pressable> : null}
    {!loading && !error && visibleItems.length === 0 ? <Text style={{ color: COLORS.muted, marginVertical: 24 }}>No rewards are available right now. Check back later.</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
      {visibleItems.map(item => {
        const imageUrl = publicImageUrl(item.image_url, 'rewards');
        const unavailable = item.stock_quantity <= 0;
        const insufficient = !summary || summary.current_balance < item.points_cost;
        const selected = item.variants?.find(row => row.id === selectedSizes[item.id] && row.enabled && row.stock_quantity > 0);
        const disabled = unavailable || insufficient || busy || loading || !!pending || (item.category === 'apparel' && !selected);
        return <View key={item.id} style={[styles.rewardCard, unavailable && styles.rewardCardUnavailable]}>
          <View style={[styles.rewardVisual, { backgroundColor: COLORS.softRed }]}>
            {imageUrl ? <Image source={{ uri: imageUrl }} accessibilityLabel={item.name} style={styles.rewardImage} resizeMode="contain" /> : <MaterialIcons name="card-giftcard" color={COLORS.brand} size={43} />}
          </View><View style={styles.rewardBody}>
            <View style={styles.rewardHeading}>
            <Text style={styles.rewardTitle}>{item.name}</Text>
            {hasVoucherValue(item) ? <Text style={styles.valueText}>₱{item.voucher_value} voucher</Text> : null}
            </View>
            {item.description ? <Text style={styles.costText} numberOfLines={2} ellipsizeMode="tail">{item.description}</Text> : null}
            <Text style={styles.costText}>Redeem for {item.points_cost} Blood Points</Text>
            <Text style={styles.costText}>{item.stock_quantity} remaining</Text>
            {item.category === 'apparel' && <View accessibilityRole="radiogroup" accessibilityLabel={`Size for ${item.name}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {item.variants?.filter(row => row.enabled).map(row => <Pressable key={row.id} accessibilityRole="radio" accessibilityLabel={`Size ${row.size}, ${row.stock_quantity > 0 ? row.stock_quantity + ' remaining' : 'sold out'}`} accessibilityState={{ selected: selected?.id === row.id, disabled: row.stock_quantity <= 0 || busy || !!pending }} disabled={row.stock_quantity <= 0 || busy || !!pending} onPress={() => setSelectedSizes(current => ({ ...current, [item.id]: row.id }))} style={{ borderWidth: 1, borderColor: selected?.id === row.id ? COLORS.brand : COLORS.border, backgroundColor: selected?.id === row.id ? COLORS.softRed : COLORS.white, borderRadius: 10, padding: 8, opacity: row.stock_quantity <= 0 ? 0.45 : 1 }}><Text style={styles.costText}>{row.size}{row.stock_quantity <= 0 ? ' — Sold out' : ` (${row.stock_quantity})`}</Text></Pressable>)}
            </View>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => confirm(item)} style={[styles.redeemButton, disabled && styles.redeemButtonDisabled]}>
              <Text style={[styles.redeemButtonText, disabled && styles.redeemButtonTextDisabled]}>{unavailable ? 'Out of Stock' : insufficient ? 'Insufficient points' : 'Redeem'}</Text>
            </Pressable>
          </View></View>;
      })}
    </View>
  </View>;
}

// Existing card, color and spacing design is retained.
const styles = StyleSheet.create({
  categoryFilter: { marginTop: 16 },
  filters: { gap: 9, paddingRight: 4, paddingVertical: 2 },
  filterChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 20, backgroundColor: COLORS.white },
  filterChipSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  filterText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: COLORS.white, fontWeight: '700' },
  filterDisabled: { opacity: 0.55 },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  fixedHeader: {
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  header: {
    width: '100%',
    maxWidth: 620,
    minHeight: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  bellButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  listContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
  },
  listHeader: { marginBottom: 17 },
  balanceSection: { alignItems: 'center' },
  balanceHeading: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  pointsCircle: {
    width: 154,
    height: 154,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 17,
    borderWidth: 4,
    borderColor: COLORS.brand,
    borderRadius: 77,
    backgroundColor: COLORS.white,
    shadowColor: PALETTE.primaryPressed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 3,
  },
  pointsNumber: {
    color: COLORS.brand,
    fontSize: 43,
    fontWeight: '800',
    lineHeight: 49,
    letterSpacing: -1,
  },
  pointsLabel: { color: COLORS.muted, fontSize: 14, fontWeight: '700' },
  rewardsHeader: {
    marginTop: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rewardsHeading: {
    flex: 1,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  myVouchersButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  myVouchersText: { color: COLORS.brand, fontSize: 11, fontWeight: '800' },
  rewardRow: { gap: 12 },
  rowSeparator: { height: 12 },
  rewardCard: {
    width: '100%',
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: PALETTE.selected,
    shadowColor: PALETTE.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  rewardCardUnavailable: { opacity: 0.72 },
  rewardVisual: {
    width: 76,
    height: 96,
    marginTop: 13,
    marginLeft: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unavailableBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: PALETTE.neutralText,
  },
  unavailableBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '800' },
  rewardImage: { width: 76, height: 96 },
  rewardBody: { flex: 1, minWidth: 0, padding: 13 },
  rewardHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  rewardTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 85, color: COLORS.text, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  valueText: { color: COLORS.brand, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  refreshButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  costText: { color: PALETTE.neutralText, fontSize: 13, marginTop: 4 },
  redeemButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: COLORS.brand,
  },
  redeemButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.98 }],
  },
  redeemButtonDisabled: { backgroundColor: PALETTE.border },
  redeemButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  redeemButtonTextDisabled: { color: PALETTE.neutralText },
});


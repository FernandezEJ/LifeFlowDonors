import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';
import { RewardDetailsModal, RewardImage } from '@/components/reward-details-modal';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
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
type RewardDetails = { reward: Reward; accountId: number; variantId?: number };


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
  const categories = ['all', ...REWARD_CATEGORIES];
  const [catalogueOwner, setCatalogueOwner] = useState<number | null>(null);
  const currentAccount = useRef(user?.id);
  useLayoutEffect(() => { currentAccount.current = user?.id; }, [user?.id]);
  const ownsCatalogue = !!user && catalogueOwner === user.id;
  const visibleItems = ownsCatalogue ? items.filter(item => category === 'all' || item.category === category) : [];
  const [summary, setSummary] = useState<PointSummary | null>(null);
  const [pending, setPending] = useState<PendingRedemption | null>(null);
  const [failure, setFailure] = useState<{ accountId?: number; message: string; action?: boolean }>({ message: '' });
  const error = failure.accountId === user?.id ? failure.message : '';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<RewardDetails | null>(null);
  const selection = useRef<RewardDetails | null>(null);
  const select = (value: RewardDetails | null) => { selection.current = value; setDetails(value); };
  const activeDetails = details?.accountId === user?.id ? details : null;
  const liveReward = ownsCatalogue ? items.find(item => item.id === activeDetails?.reward.id) : undefined;
  const selectedReward = liveReward ?? activeDetails?.reward ?? null;
  const currentSummary = ownsCatalogue ? summary : null;
  const pendingAttempt = ownsCatalogue ? pending : null;
  const [requestKey, setRequestKey] = useState('');
  const lock = useRef(false);
  const submitted = useRef(false);
  const generation = useRef(0);
  const fetching = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (fetching.current === generation.current) return;
    const current = ++generation.current;
    fetching.current = current;
    setLoading(true); setFailure({ accountId: user?.id, message: '' });
    try {
      const [catalogue, balance, saved] = await Promise.all([rewards(), pointsSummary(), user ? redemptionStorage.read(user.id) : null]);
      if (current !== generation.current || currentAccount.current !== user?.id) return;
      setItems(catalogue.data); setRequestKey(catalogue.request_key);
      setCatalogueOwner(user?.id ?? null);
      setSummary(balance); onBalance?.(balance.current_balance); setPending(saved);
    } catch (cause) { if (current === generation.current) setFailure({ accountId: user?.id, message: errorMessage(cause) }); }
    finally { if (fetching.current === current) fetching.current = null; if (current === generation.current) setLoading(false); }
  }, [rewards, pointsSummary, user, onBalance]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));

  // ========================================
  // CONFIRMED, PERSISTENT AND IDEMPOTENT SPENDING
  // Save the request key before sending. Uncertain failures retain it, including
  // after restart. A synchronous lock blocks both duplicate dialogs and taps.
  // ========================================
  const spend = async (attempt: PendingRedemption) => {
    if (submitted.current) return;
    if (!user || currentAccount.current !== user.id || !ownsCatalogue) { lock.current = false; return; }
    submitted.current = true;
    const current = generation.current;
    setBusy(true); setFailure({ accountId: user.id, message: '' });
    try {
      await redemptionStorage.save(user.id, attempt);
      // A storage write can outlive logout/account switching. Never submit it under the next session.
      if (currentAccount.current !== user.id) return;
      setPending(attempt);
      if (current !== generation.current) return;
      const result = await redeemReward(attempt.rewardId, attempt.requestKey, attempt.variantId);
      await redemptionStorage.clear(user.id);
      if (current !== generation.current || currentAccount.current !== user.id) return;
      setSummary(result.summary); onBalance?.(result.summary.current_balance);
      setItems(list => list.map(item => item.id === result.reward.id ? result.reward : item));
      setPending(null);
      router.navigate('/my-vouchers');
    } catch (cause) {
      if (current !== generation.current || currentAccount.current !== user.id) return;
      if (cause instanceof ApiError && [404, 422].includes(cause.status)) {
        await redemptionStorage.clear(user.id).catch(() => undefined);
        if (current !== generation.current || currentAccount.current !== user.id) return;
        setPending(null);
      }
      setFailure({ accountId: user.id, message: errorMessage(cause), action: true });
    } finally { submitted.current = false; lock.current = false; setBusy(false); if (selection.current?.accountId === user.id) select(null); }
  };
  const variant = liveReward?.category === 'apparel' ? liveReward.variants?.find(row => row.id === activeDetails?.variantId && row.enabled && Number.isFinite(row.stock_quantity) && row.stock_quantity > 0) : undefined;
  const reason = busy ? 'Redeeming your reward. Please wait.'
    : pendingAttempt ? 'Resolve your pending redemption first. Close this popup and use Retry pending redemption.'
    : loading ? 'Refreshing points and inventory. Please wait.'
    : !user || !ownsCatalogue || !currentSummary || !Number.isFinite(currentSummary.current_balance) || currentSummary.current_balance < 0 || !requestKey?.trim() ? 'Points or inventory data is unavailable. Close and retry loading rewards.'
    : !liveReward ? 'This reward is no longer available. Close and refresh rewards.'
    : !Number.isFinite(liveReward.stock_quantity) || !Number.isFinite(liveReward.points_cost) || liveReward.points_cost < 1 ? 'Reward inventory or points data is unavailable. Close and retry loading rewards.'
    : liveReward.stock_quantity < 1 ? 'This reward is out of stock.'
    : currentSummary.current_balance < liveReward.points_cost ? 'You have insufficient Blood Points for this reward.'
    : liveReward.category === 'apparel' && !liveReward.variants?.some(row => row.enabled && Number.isFinite(row.stock_quantity) && row.stock_quantity > 0) ? 'No sizes are currently available for this reward.'
    : liveReward.category === 'apparel' && !variant ? 'Choose an available size before redeeming.' : '';
  const redeemDetails = () => {
    if (lock.current || submitted.current || reason || !liveReward || !activeDetails || selection.current !== activeDetails || currentAccount.current !== activeDetails.accountId) return;
    lock.current = true;
    void spend({ rewardId: liveReward.id, requestKey, ...(variant ? { variantId: variant.id } : {}) });
  };
  const closeDetails = () => { if (!submitted.current) select(null); };
  const openDetails = (reward: Reward) => {
    if (!user || !ownsCatalogue || lock.current || submitted.current || busy) return;
    select({ reward, accountId: user.id });
  };

  // ========================================
  // CATALOGUE STATES AND FINITE STOCK
  // No sample rewards or optimistic balance changes are displayed.
  // A pending retry remains available even when its previous purchase used the last unit.
  // ========================================
  return <View>
    <RewardDetailsModal reward={selectedReward} balance={currentSummary && Number.isFinite(currentSummary.current_balance) ? currentSummary.current_balance : null}
      variantId={variant?.id} busy={busy} reason={reason} selectionDisabled={busy || loading || !!pendingAttempt}
      onClose={closeDetails} onRedeem={redeemDetails} onSelectVariant={id => {
        if (submitted.current || loading || pendingAttempt || !liveReward || !activeDetails || selection.current !== activeDetails) return;
        if (liveReward.category === 'apparel' && liveReward.variants?.some(row => row.id === id && row.enabled && row.stock_quantity > 0)) {
          select({ ...activeDetails, variantId: id });
        }
      }} />
    {showBalance ? <View style={styles.balanceSection}><Text style={styles.balanceHeading}>Your Blood Points</Text>
      {loading && !currentSummary ? <TabSkeleton variant="points" label="Loading reward balance" /> : currentSummary ? <View style={styles.pointsCircle}><Text style={styles.pointsNumber}>{Number.isFinite(currentSummary.current_balance) ? currentSummary.current_balance : '--'}</Text><Text style={styles.pointsLabel}>Points</Text></View> : null}</View> : null}
    <View style={styles.rewardsHeader}><Text style={styles.rewardsHeading}>Available Rewards</Text>
      {loading && currentSummary ? <ActivityIndicator color={COLORS.brand} size="small" accessibilityLabel="Refreshing rewards" /> : null}
      <Pressable onPress={() => router.navigate('/my-vouchers')} style={styles.myVouchersButton}><Text style={styles.myVouchersText}>My Rewards</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Reward category"
      style={styles.categoryFilter} contentContainerStyle={styles.filters}>
      {categories.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: category === value, disabled: busy }}
        disabled={busy} hitSlop={{ top: 2, bottom: 2 }} onPress={() => { if (!submitted.current) { setCategory(value); select(null); } }}
        style={[styles.filterChip, category === value && styles.filterChipSelected, busy && styles.filterDisabled]}>
        <Text style={[styles.filterText, category === value && styles.filterTextSelected]}>{value === 'all' ? 'All Categories' : value[0].toUpperCase() + value.slice(1)}</Text>
      </Pressable>)}
    </ScrollView>
    {loading && !currentSummary ? <TabSkeleton variant="rewards" label="Loading rewards" /> : null}
    {error ? <LoadError message={error} subject="rewards" action={failure.action} loading={busy || loading || !!activeDetails} onRetry={() => { if (!submitted.current) return refresh(); }} /> : null}
    {pendingAttempt ? <Pressable disabled={busy || loading} style={styles.myVouchersButton} onPress={() => { if (!lock.current && !loading && !submitted.current) { lock.current = true; void spend(pendingAttempt); } }}>
      <Text style={styles.myVouchersText}>{busy ? 'Submitting...' : 'Retry pending redemption'}</Text></Pressable> : null}
    {!loading && !error && ownsCatalogue && visibleItems.length === 0 ? <EmptyState icon="redeem" title={category === 'all' ? 'No rewards available right now' : 'No matching rewards'}
      description={category === 'all' ? 'Check back later for available LifeFlow rewards.' : 'No rewards are available in this category. Try another category.'} /> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
      {visibleItems.map(item => {
        const unavailable = item.stock_quantity <= 0;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View reward details: ${item.name}, ${item.points_cost} Blood Points`}
          disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => openDetails(item)}
          style={({ pressed }) => [styles.rewardCard, unavailable && styles.rewardCardUnavailable, pressed && styles.pressed]}>
          <View style={styles.rewardVisual}><RewardImage reward={item} /></View><View style={styles.rewardBody}>
            <View style={styles.rewardHeading}>
            <Text style={styles.rewardTitle}>{item.name}</Text>
            <MaterialIcons name="chevron-right" size={20} color={COLORS.brand} style={{ flexShrink: 0 }} accessible={false} />
            </View>
            {hasVoucherValue(item) ? <Text style={styles.valueText}>₱{item.voucher_value} voucher</Text> : null}
            {item.description ? <Text style={styles.costText} numberOfLines={2} ellipsizeMode="tail">{item.description}</Text> : null}
            <Text style={styles.costText}>Redeem for {item.points_cost} Blood Points</Text>
            <Text style={styles.costText}>{item.stock_quantity} remaining</Text>
          </View></Pressable>;
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
  rewardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  rewardTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  valueText: { color: COLORS.brand, fontSize: 13, fontWeight: '700', flexShrink: 1, marginTop: 4 },
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


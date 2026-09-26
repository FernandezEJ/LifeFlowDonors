import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import { redemptionStorage, type PendingRedemption } from '@/services/redemption-storage';
import type { PointSummary, Reward } from '@/services/rewards';
const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  border: '#F0E2DC',
  white: '#FFFFFF',
  softRed: '#FDE8E8',
};


// ========================================
// SHARED REAL REWARD CATALOGUE
// Preserves reward cards and balance design across Points and Redeem.
// Focus refreshes prices, stock and balance; old session responses are discarded.
// ========================================
export function RewardCatalogue({ showBalance = false, onBalance }: { showBalance?: boolean; onBalance?: (balance: number) => void }) {
  const { user, rewards, pointsSummary, redeemReward } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Reward[]>([]);
  const [summary, setSummary] = useState<PointSummary | null>(null);
  const [pending, setPending] = useState<PendingRedemption | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const result = await redeemReward(attempt.rewardId, attempt.requestKey);
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
    } finally { submitted.current = false; lock.current = false; setBusy(false); }
  };
  const confirm = (reward: Reward) => {
    if (lock.current || loading || pending || !summary || reward.stock_quantity < 1 || summary.current_balance < reward.points_cost) return;
    lock.current = true;
    Alert.alert('Confirm Redemption', 'Redeem this reward for ' + reward.points_cost + ' points?', [
      { text: 'Cancel', style: 'cancel', onPress: () => { lock.current = false; } },
      { text: 'Redeem', onPress: () => void spend({ rewardId: reward.id, requestKey: requestKey.current }) },
    ], { cancelable: false });
  };

  // ========================================
  // CATALOGUE STATES AND FINITE STOCK
  // No sample rewards or optimistic balance changes are displayed.
  // A pending retry remains available even when its previous purchase used the last unit.
  // ========================================
  return <View>
    {showBalance ? <View style={styles.balanceSection}><Text style={styles.balanceHeading}>Your Blood Points</Text>
      <View style={styles.pointsCircle}><Text style={styles.pointsNumber}>{summary?.current_balance ?? '--'}</Text><Text style={styles.pointsLabel}>Points</Text></View></View> : null}
    <View style={styles.rewardsHeader}><Text style={styles.rewardsHeading}>Available Rewards</Text>
      <Pressable onPress={() => router.navigate('/my-vouchers')} style={styles.myVouchersButton}><Text style={styles.myVouchersText}>My Vouchers</Text></Pressable></View>
    {loading ? <Text>Loading rewards...</Text> : null}
    {error ? <View><Text accessibilityRole="alert">{error}</Text><Pressable disabled={busy} onPress={() => void refresh()}><Text>Refresh rewards</Text></Pressable></View> : null}
    {pending ? <Pressable disabled={busy} style={styles.myVouchersButton} onPress={() => { if (!lock.current) { lock.current = true; void spend(pending); } }}>
      <Text style={styles.myVouchersText}>{busy ? 'Submitting...' : 'Retry pending redemption'}</Text></Pressable> : null}
    {!loading && !error && items.length === 0 ? <Text style={{ color: COLORS.muted, marginVertical: 24 }}>No rewards are available right now. Check back later.</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
      {items.map(item => {
        const unavailable = item.stock_quantity <= 0;
        const insufficient = !summary || summary.current_balance < item.points_cost;
        const disabled = unavailable || insufficient || busy || loading || !!pending;
        return <View key={item.id} style={[styles.rewardCard, { flex: 0, width: '47%' }, unavailable && styles.rewardCardUnavailable]}>
          <View style={[styles.rewardVisual, { backgroundColor: COLORS.softRed }]}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 96 }} resizeMode="cover" /> : <MaterialIcons name="card-giftcard" color={COLORS.brand} size={43} />}
          </View><View style={styles.rewardBody}>
            <Text style={styles.rewardTitle}>{item.name}</Text>
            {item.description ? <Text style={styles.costText}>{item.description}</Text> : null}
            <Text style={styles.costText}>{item.points_cost} Blood Points</Text>
            <Text style={styles.costText}>{item.stock_quantity} remaining</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => confirm(item)} style={[styles.redeemButton, disabled && styles.redeemButtonDisabled]}>
              <Text style={styles.redeemButtonText}>{unavailable ? 'Out of stock' : insufficient ? 'Insufficient points' : 'Redeem'}</Text>
            </Pressable>
          </View></View>;
      })}
    </View>
  </View>;
}

// Existing card, color and spacing design is retained.
const styles = StyleSheet.create({
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
    shadowColor: '#8B3028',
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
    borderColor: '#F0CBC6',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  myVouchersText: { color: COLORS.brand, fontSize: 11, fontWeight: '800' },
  rewardRow: { gap: 12 },
  rowSeparator: { height: 12 },
  rewardCard: {
    minHeight: 242,
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: '#FFF3F0',
    shadowColor: '#6E514C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 2,
  },
  rewardCardUnavailable: { opacity: 0.72 },
  rewardVisual: {
    height: 96,
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
    backgroundColor: '#756B68',
  },
  unavailableBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '800' },
  rewardBody: { flex: 1, padding: 13 },
  rewardTitle: { minHeight: 38, color: COLORS.text, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  costText: { flex: 1, color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  redeemButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: COLORS.brand,
  },
  redeemButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.98 }],
  },
  redeemButtonDisabled: { backgroundColor: '#D7CECA' },
  redeemButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  redeemButtonTextDisabled: { color: '#756B68' },
});


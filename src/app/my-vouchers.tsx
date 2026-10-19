import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { voucherActionLabel, voucherDate, voucherState, voucherStatusLabel, type Page, type Voucher, type VoucherStatus } from '@/services/rewards';
const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  border: '#F0E2DC',
  white: '#FFFFFF',
  softRed: '#FDE8E8',
  active: '#287A47',
  activeBackground: '#E2F5E9',
  expiredBackground: '#EEE9E6',
};


// ========================================
// OWNED VOUCHER HISTORY
// Filter by raw server status before paging, then distinguish confirmed claims
// from legacy history. Codes are fetched only on the detail screen.
// ========================================
const FILTERS = ['All', 'Available', 'Pending Claim', 'Claimed'] as const;
const STATUS_FILTERS: Record<typeof FILTERS[number], VoucherStatus | undefined> = { All: undefined, Available: 'available', 'Pending Claim': 'active', Claimed: 'redeemed' };
export default function MyVouchersScreen() {
  const router = useRouter();
  const { vouchers, user } = useAuth();
  const accountId = user?.id;
  const [selected, setSelected] = useState<typeof FILTERS[number]>('All');
  const [page, setPage] = useState<(Page<Voucher> & { accountId: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (number = 1) => {
    const current = ++generation.current; setLoading(true); setError('');
    if (!accountId) { setPage(null); setLoading(false); return; }
    if (number === 1) setPage(null);
    try {
      const result = await vouchers(number, STATUS_FILTERS[selected]);
      const data = result.data.map(item => ({ ...item, claim_code: null }));
      if (current === generation.current) setPage(previous => ({ ...result, accountId, data: number === 1 ? data : [...(previous?.accountId === accountId ? previous.data : []), ...data] }));
    } catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [vouchers, selected, accountId]);
  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else { generation.current++; setPage(null); setLoading(true); }
    });
    return () => { generation.current++; setPage(null); subscription.remove(); };
  }, [load]));
  const currentPage = accountId && page?.accountId === accountId && !error ? page : null;
  const records = currentPage?.data.filter(item => selected === 'All' || voucherStatusLabel(item) === selected) ?? [];

  // ========================================
  // EXISTING CARDS AND FILTER CHIPS
  // Status and historical points come from Laravel, never the old mock store.
  // ========================================
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.headerButton}><MaterialIcons name="arrow-back" color={COLORS.text} size={23} /></Pressable>
        <Text style={styles.headerTitle}>My Rewards</Text><NotificationBell />
      </View></View>
      <FlatList data={records} keyExtractor={item => String(item.id)} contentContainerStyle={styles.listContent}
        refreshing={loading} onRefresh={() => void load()} ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<View style={styles.listHeader}>
          <Text style={styles.introTitle}>Your reward vouchers</Text><Text style={styles.introText}>Activate a claim code when you are ready to collect your reward.</Text>
          <View style={styles.filterBar}>{FILTERS.map(filter => <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: selected === filter }}
            onPress={() => { if (selected !== filter) { setPage(null); setSelected(filter); } }} style={[styles.filterChip, selected === filter && styles.filterChipSelected]}>
            <Text style={[styles.filterText, selected === filter && styles.filterTextSelected]}>{filter}</Text></Pressable>)}</View>
          {error ? <View><Text accessibilityRole="alert">{error}</Text><Pressable onPress={() => void load()}><Text>Retry</Text></Pressable></View> : null}
        </View>}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>{loading ? 'Loading vouchers...' : error ? 'Vouchers unavailable.' : 'No vouchers found.'}</Text></View>}
        ListFooterComponent={currentPage && currentPage.current_page < currentPage.last_page ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load(currentPage.current_page + 1)}><Text>Load more</Text></Pressable> : null}
        renderItem={({ item }) => <View style={styles.voucherCard}>
          <View style={styles.cardTopRow}><View style={styles.voucherIcon}><MaterialIcons name="confirmation-number" color={COLORS.brand} size={25} /></View>
            <View style={styles.cardHeading}><Text style={styles.voucherTitle}>{item.reward.name}</Text><Text style={styles.voucherCost}>{item.points_spent} Blood Points</Text></View>
            <View style={[styles.statusBadge, { backgroundColor: voucherState(item) === 'claimed' ? COLORS.activeBackground : voucherState(item) === 'legacy' || voucherState(item) === 'unavailable' ? COLORS.expiredBackground : COLORS.softRed }]}><Text style={styles.statusText}>{voucherStatusLabel(item)}</Text></View></View>
          {item.activated_at ? <Text style={styles.stateMessage}>Activated: {voucherDate(item.activated_at)}</Text> : null}
          {voucherState(item) === 'claimed' ? <Text style={styles.stateMessage}>Claimed: {voucherDate(item.claimed_at)}</Text> : null}
          {voucherState(item) === 'available' ? <Text style={styles.stateMessage}>Ready to activate your claim code.</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`${voucherActionLabel(item)} for ${item.reward.name}`} disabled={loading} style={styles.viewButton} onPress={() => router.push({ pathname: '/voucher', params: { id: String(item.id) } })}><Text style={styles.viewButtonText}>{voucherActionLabel(item)}</Text></Pressable>
        </View>} />
    </SafeAreaView></>;
}
// Existing spacing, colors and cards are preserved.
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
  headerButton: {
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
    paddingBottom: 32,
  },
  listHeader: { marginBottom: 20 },
  intro: { marginBottom: 16 },
  introTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  introText: { marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChip: {
    minHeight: 36,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  filterChipSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  filterChipPressed: { opacity: 0.75 },
  filterText: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  filterTextSelected: { color: COLORS.white, fontWeight: '800' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyText: { marginTop: 9, color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  separator: { height: 14 },
  voucherCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    shadowColor: '#6E514C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  voucherIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.softRed,
  },
  cardHeading: { flex: 1 },
  voucherTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  voucherCost: { marginTop: 3, color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  stateMessage: { marginTop: 14, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  viewButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
  },
  viewButtonSecondary: {
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
  },
  viewButtonPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  viewButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  viewButtonSecondaryText: { color: COLORS.brand },
});

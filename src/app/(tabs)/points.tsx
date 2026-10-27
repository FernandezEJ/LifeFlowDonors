import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import type { Page, PointTransaction } from '@/services/rewards';
import { NotificationBell } from '@/components/notification-bell';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  brandPressed: PALETTE.primaryPressed,
  text: PALETTE.text,
  muted: PALETTE.neutral,
  border: PALETTE.border,
  white: PALETTE.surface,
  softRed: PALETTE.selected,
  transactionBackground: PALETTE.pointsSurface,
  earned: PALETTE.successText,
  redeemed: PALETTE.primary,
};

type TransactionFilter = 'all' | 'earned' | 'redeemed';

const FILTERS: readonly { label: string; value: TransactionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Earned', value: 'earned' },
  { label: 'Redeemed', value: 'redeemed' },
];

export default function PointsScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const historyScrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    historyScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  const [selectedFilter, setSelectedFilter] = useState<TransactionFilter>('all');


  // ========================================
  // PRIVATE PAGINATED LEDGER
  // Filters query the whole server history; focus refreshes after spending.
  // ========================================
  const { pointTransactions, pointsSummary } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState('');
  const balanceGeneration = useRef(0);
  const balanceRequest = useRef<number | null>(null);
  const loadBalance = useCallback(async () => {
    if (balanceRequest.current === balanceGeneration.current) return;
    const current = ++balanceGeneration.current;
    balanceRequest.current = current;
    setBalanceLoading(true); setBalanceError('');
    try {
      const summary = await pointsSummary();
      if (current === balanceGeneration.current) setBalance(summary.current_balance);
    } catch (cause) {
      if (current === balanceGeneration.current) setBalanceError(errorMessage(cause));
    } finally {
      if (balanceRequest.current === current) balanceRequest.current = null;
      if (current === balanceGeneration.current) setBalanceLoading(false);
    }
  }, [pointsSummary]);
  useFocusEffect(useCallback(() => {
    void loadBalance();
    return () => { balanceGeneration.current++; };
  }, [loadBalance]));
  const [page, setPage] = useState<Page<PointTransaction> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const historyRequest = useRef<number | null>(null);
  const retryPage = useRef(1);
  const load = useCallback(async (number = 1) => {
    if (historyRequest.current === generation.current) return;
    const current = ++generation.current; setLoading(true); setError('');
    historyRequest.current = current;
    retryPage.current = number;
    try {
      const result = await pointTransactions(number, selectedFilter === 'all' ? undefined : selectedFilter === 'earned' ? 'donation_reward' : 'reward_redemption');
      if (current === generation.current) setPage(previous => number === 1 ? result : { ...result, data: [...(previous?.data ?? []), ...result.data] });
    } catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { if (historyRequest.current === current) historyRequest.current = null; if (current === generation.current) setLoading(false); }
  }, [pointTransactions, selectedFilter]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const filteredTransactions = page?.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Points</Text>
          {/* Shared backend unread count refreshes on focus. */}<NotificationBell />
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.balanceSection}>
            <Text style={styles.balanceHeading}>Your Blood Points</Text>
            {balance === null && balanceLoading ? <TabSkeleton variant="points" label="Loading points balance" /> : balance !== null ? <>
            <View
              accessibilityLabel={`${(balance ?? '--')} Blood Points`}
              accessibilityRole="text"
              style={styles.pointsCircle}>
              {/* The server summary refreshes after returning from Redeem. */}
              <Text style={styles.pointsNumber}>{(balance ?? '--')}</Text>
              <Text style={styles.pointsLabel}>Points</Text>
            </View>
            <View style={styles.pointsActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/redeem')}
              style={({ pressed }) => [
                styles.redeemButton,
                pressed && styles.redeemButtonPressed,
              ]}>
              <Text style={styles.redeemButtonText}>Redeem</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/my-vouchers')} style={({ pressed }) => [styles.vouchersButton, pressed && styles.pressed]}>
              <Text style={styles.vouchersText}>My Rewards</Text>
            </Pressable>
            </View>
            </> : null}
          </View>
          {balanceError ? <LoadError message={balanceError} subject="points balance" retryLabel="Retry balance" loading={balanceLoading} onRetry={loadBalance} /> : null}
          <View style={styles.transactionsSection}>
            <Text style={styles.historyHeading}>Points History</Text>
            <View style={styles.filterBar}>
              {FILTERS.map((filter) => {
                const selected = selectedFilter === filter.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={filter.value}
                    onPress={() => { if (selectedFilter !== filter.value) { setPage(null); setLoading(true); setSelectedFilter(filter.value); } }}
                    style={({ pressed }) => [
                      styles.filterButton,
                      selected && styles.filterButtonSelected,
                      pressed && styles.filterButtonPressed,
                    ]}>
                    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loading && !page ? <TabSkeleton variant="transactions" label="Loading points history" /> : null}
            {error ? <LoadError message={error} subject="points history" loading={loading} onRetry={() => load(retryPage.current)} /> : null}
            {page || !loading ? <ScrollView ref={historyScrollRef} key={selectedFilter} accessibilityLabel="Points history" nestedScrollEnabled
              showsVerticalScrollIndicator={false} scrollEnabled={filteredTransactions.length > 5} bounces={false}
              style={[styles.historyViewport, filteredTransactions.length > 5 && styles.historyLimited]}
              contentContainerStyle={styles.transactionList}>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => {
                  const earned = transaction.amount > 0;
                  const transactionColor = earned ? COLORS.earned : COLORS.redeemed;

                  return (
                    <View key={transaction.id} style={styles.transactionCard}>
                      <View
                        style={[styles.transactionAccent, { backgroundColor: transactionColor }]}
                      />
                      <View style={styles.transactionDetails}>
                        <Text style={styles.transactionDescription}>{transaction.description}</Text>
                        <Text style={styles.transactionDate}>{new Date(transaction.created_at).toLocaleDateString()}</Text>
                      </View>
                      <Text style={[styles.transactionPoints, { color: transactionColor }]}>
                        {earned ? '+' : '-'}
                        {Math.abs(transaction.amount)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                !error && page ? <EmptyState icon="receipt-long" title={selectedFilter === 'all' ? 'No transactions yet' : 'No matching transactions'} description={selectedFilter === 'all' ? 'Your earned and spent points will appear here.' : 'Try another points history filter.'} /> : null
              )}
            {page && page.current_page < page.last_page ? <Pressable style={styles.retry} disabled={loading} onPress={() => void load(page.current_page + 1)}><Text style={{color:PALETTE.text}}>{loading ? 'Loading more...' : 'Load more transactions'}</Text></Pressable> : null}
            </ScrollView> : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  fixedHeader: {
    zIndex: 10,
    backgroundColor: COLORS.background,
  },
  header: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  headerTitle: { color: PALETTE.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.white,
  },
  pressed: { opacity: 0.7 },
  notificationDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 28 },
  balanceSection: { alignItems: 'center' },
  pointsActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  vouchersButton: { flexGrow: 1, flexBasis: 130, alignItems: 'center', justifyContent: 'center', minHeight: 50, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  vouchersText: { color: COLORS.brand, fontSize: 15, fontWeight: '700' },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  historyHeading: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
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
  redeemButton: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  redeemButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  redeemButtonText: { color: COLORS.brand, fontSize: 15, fontWeight: '700' },
  transactionsSection: {
    padding: 15,
    borderWidth: 1,
    borderColor: PALETTE.pointsBorder,
    borderRadius: 23,
    backgroundColor: COLORS.transactionBackground,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 7,
    padding: 4,
    borderRadius: 18,
    backgroundColor: PALETTE.surface,
  },
  filterButton: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  filterButtonSelected: { backgroundColor: COLORS.brand },
  filterButtonPressed: { opacity: 0.75 },
  filterText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: COLORS.white, fontWeight: '700' },
  historyViewport: { marginTop: 13, flexGrow: 0, flexShrink: 0 },
  historyLimited: { maxHeight: 420 },
  transactionList: { gap: 10 },
  transactionCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    paddingVertical: 13,
    paddingRight: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.white,
  },
  transactionAccent: { alignSelf: 'stretch', width: 5, borderRadius: 3 },
  transactionDetails: { flex: 1 },
  transactionDescription: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  transactionDate: { marginTop: 4, color: COLORS.muted, fontSize: 12, fontWeight: '500' },
  transactionPoints: { minWidth: 58, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  emptyState: {
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 17,
    backgroundColor: COLORS.white,
  },
  emptyText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
});


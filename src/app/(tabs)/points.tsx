import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  border: '#F0E2DC',
  white: '#FFFFFF',
  softRed: '#FDE8E8',
  transactionBackground: '#FFF3DC',
  earned: '#348455',
  redeemed: '#CC684A',
};

const BLOOD_POINTS = 235;

type TransactionType = 'earned' | 'redeemed';
type TransactionFilter = 'all' | TransactionType;

type PointsTransaction = {
  id: string;
  type: TransactionType;
  points: number;
  date: string;
  description: string;
};

const TRANSACTIONS: readonly PointsTransaction[] = [
  {
    id: '1',
    type: 'earned',
    points: 150,
    date: '04 Sept 2026',
    description: 'You have earned',
  },
  {
    id: '2',
    type: 'redeemed',
    points: 150,
    date: '04 Sept 2026',
    description: 'You have redeemed',
  },
  {
    id: '3',
    type: 'redeemed',
    points: 60,
    date: '04 Sept 2026',
    description: 'You have redeemed',
  },
  {
    id: '4',
    type: 'redeemed',
    points: 25,
    date: '04 Sept 2026',
    description: 'You have redeemed',
  },
];

const FILTERS: readonly { label: string; value: TransactionFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Earned', value: 'earned' },
  { label: 'Redeemed', value: 'redeemed' },
];

export default function PointsScreen() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<TransactionFilter>('all');

  const filteredTransactions = useMemo(
    () =>
      selectedFilter === 'all'
        ? TRANSACTIONS
        : TRANSACTIONS.filter((transaction) => transaction.type === selectedFilter),
    [selectedFilter],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Points</Text>
          <Pressable
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
            <MaterialIcons name="notifications-none" color={COLORS.text} size={25} />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.balanceSection}>
            <Text style={styles.balanceHeading}>Your Blood Points</Text>
            <View
              accessibilityLabel={`${BLOOD_POINTS} Blood Points`}
              accessibilityRole="text"
              style={styles.pointsCircle}>
              {/* TODO: Real points balance will later come from Laravel/backend. */}
              <Text style={styles.pointsNumber}>{BLOOD_POINTS}</Text>
              <Text style={styles.pointsLabel}>Points</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/redeem')}
              style={({ pressed }) => [
                styles.redeemButton,
                pressed && styles.redeemButtonPressed,
              ]}>
              <Text style={styles.redeemButtonText}>Redeem</Text>
            </Pressable>
          </View>

          <View style={styles.transactionsSection}>
            <View style={styles.filterBar}>
              {FILTERS.map((filter) => {
                const selected = selectedFilter === filter.value;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={filter.value}
                    onPress={() => setSelectedFilter(filter.value)}
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

            <View style={styles.transactionList}>
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => {
                  const earned = transaction.type === 'earned';
                  const transactionColor = earned ? COLORS.earned : COLORS.redeemed;

                  return (
                    <View key={transaction.id} style={styles.transactionCard}>
                      <View
                        style={[styles.transactionAccent, { backgroundColor: transactionColor }]}
                      />
                      <View style={styles.transactionDetails}>
                        <Text style={styles.transactionDescription}>{transaction.description}</Text>
                        <Text style={styles.transactionDate}>{transaction.date}</Text>
                      </View>
                      <Text style={[styles.transactionPoints, { color: transactionColor }]}>
                        {earned ? '+' : '-'}
                        {transaction.points}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="receipt-long" color={COLORS.muted} size={28} />
                  <Text style={styles.emptyText}>No transactions yet.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

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
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  headerTitle: { color: COLORS.brand, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
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
  redeemButton: {
    minWidth: 174,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
  redeemButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.99 }],
  },
  redeemButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  transactionsSection: {
    padding: 15,
    borderWidth: 1,
    borderColor: '#F1DFC1',
    borderRadius: 23,
    backgroundColor: COLORS.transactionBackground,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 7,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
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
  transactionList: { gap: 10, marginTop: 13 },
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

// TODO: Completed and verified donations will create earned point transactions in Laravel.
// Reward redemption will create redeemed transactions there as well.
// The frontend must not directly decide or permanently modify the points balance.

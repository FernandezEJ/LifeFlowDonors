import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  expireElapsedVouchers,
  type MockVoucher,
  type VoucherStatus,
  useMockVouchers,
} from '@/services/mock-voucher-store';

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

const STATUS_STYLE: Record<VoucherStatus, { background: string; color: string }> = {
  AVAILABLE: { background: COLORS.softRed, color: COLORS.brand },
  ACTIVE: { background: COLORS.activeBackground, color: COLORS.active },
  EXPIRED: { background: COLORS.expiredBackground, color: COLORS.muted },
};

type VoucherFilter = 'ALL' | VoucherStatus;

const FILTERS: readonly { label: string; value: VoucherFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Available', value: 'AVAILABLE' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Expired', value: 'EXPIRED' },
];

function formatRemaining(expiresAt: number | undefined, now: number) {
  const seconds = Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function VoucherCard({ voucher, now }: { voucher: MockVoucher; now: number }) {
  const router = useRouter();
  const statusStyle = STATUS_STYLE[voucher.status];
  const actionLabel =
    voucher.status === 'AVAILABLE'
      ? 'View Voucher'
      : voucher.status === 'ACTIVE'
        ? 'View QR'
        : 'View Details';

  return (
    <View style={styles.voucherCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.voucherIcon}>
          <MaterialIcons name="confirmation-number" color={COLORS.brand} size={25} />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.voucherTitle}>{voucher.title}</Text>
          <Text style={styles.voucherCost}>{voucher.cost} Blood Points</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.background }]}>
          <Text style={[styles.statusText, { color: statusStyle.color }]}>{voucher.status}</Text>
        </View>
      </View>

      {voucher.status === 'ACTIVE' ? (
        <Text style={styles.stateMessage}>
          Expires in {formatRemaining(voucher.expiresAt, now)}
        </Text>
      ) : null}
      {voucher.status === 'AVAILABLE' ? (
        <Text style={styles.stateMessage}>Ready to activate when you are at the counter.</Text>
      ) : null}
      {voucher.status === 'EXPIRED' ? (
        <Text style={styles.stateMessage}>Activation window ended.</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/voucher', params: { id: voucher.id } })
        }
        style={({ pressed }) => [
          styles.viewButton,
          voucher.status === 'EXPIRED' && styles.viewButtonSecondary,
          pressed && styles.viewButtonPressed,
        ]}>
        <Text
          style={[
            styles.viewButtonText,
            voucher.status === 'EXPIRED' && styles.viewButtonSecondaryText,
          ]}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function MyVouchersScreen() {
  const router = useRouter();
  const vouchers = useMockVouchers();
  const [now, setNow] = useState(() => Date.now());
  const [selectedFilter, setSelectedFilter] = useState<VoucherFilter>('ALL');
  const filteredVouchers = useMemo(
    () =>
      selectedFilter === 'ALL'
        ? vouchers
        : vouchers.filter((voucher) => voucher.status === selectedFilter),
    [selectedFilter, vouchers],
  );

  useEffect(() => {
    expireElapsedVouchers();
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      expireElapsedVouchers(currentTime);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.fixedHeader}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <MaterialIcons name="arrow-back" color={COLORS.text} size={23} />
            </Pressable>
            <Text style={styles.headerTitle}>My Vouchers</Text>
            <Pressable
              accessibilityLabel="Open notifications"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
              <MaterialIcons name="notifications-none" color={COLORS.text} size={24} />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredVouchers}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(voucher) => voucher.id}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.intro}>
                <Text style={styles.introTitle}>Your reward vouchers</Text>
                <Text style={styles.introText}>
                  Activate a voucher only when you are ready to present its demo QR.
                </Text>
              </View>
              <View style={styles.filterBar}>
                {FILTERS.map((filter) => {
                  const selected = selectedFilter === filter.value;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={filter.value}
                      onPress={() => setSelectedFilter(filter.value)}
                      style={({ pressed }) => [
                        styles.filterChip,
                        selected && styles.filterChipSelected,
                        pressed && styles.filterChipPressed,
                      ]}>
                      <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                        {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="confirmation-number" color={COLORS.muted} size={31} />
              <Text style={styles.emptyText}>No vouchers found.</Text>
            </View>
          }
          renderItem={({ item }) => <VoucherCard voucher={item} now={now} />}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </>
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

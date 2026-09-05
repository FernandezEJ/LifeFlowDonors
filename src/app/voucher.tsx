import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  activateMockVoucher,
  expireElapsedVouchers,
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
  warning: '#FFF3DC',
  warningBorder: '#F0D8A4',
  active: '#287A47',
  activeBackground: '#E2F5E9',
  expiredBackground: '#EEE9E6',
};

function formatRemaining(expiresAt: number | undefined, now: number) {
  const seconds = Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatTimestamp(timestamp: number | undefined) {
  if (!timestamp) return 'Not recorded';
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function VoucherScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const voucherId = Array.isArray(id) ? id[0] : id;
  const vouchers = useMockVouchers();
  const voucher = vouchers.find((item) => item.id === voucherId) ?? vouchers[0];
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    expireElapsedVouchers();
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      expireElapsedVouchers(currentTime);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!voucher) return null;

  const activateVoucher = () => {
    activateMockVoucher(voucher.id);
    setNow(Date.now());
  };

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
            <Text style={styles.headerTitle}>Voucher</Text>
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

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.titleBlock}>
              <View
                style={[
                  styles.statusBadge,
                  voucher.status === 'ACTIVE' && styles.activeBadge,
                  voucher.status === 'EXPIRED' && styles.expiredBadge,
                ]}>
                <Text
                  style={[
                    styles.statusText,
                    voucher.status === 'ACTIVE' && styles.activeStatusText,
                    voucher.status === 'EXPIRED' && styles.expiredStatusText,
                  ]}>
                  {voucher.status}
                </Text>
              </View>
              <Text style={styles.voucherTitle}>{voucher.title}</Text>
              <Text style={styles.voucherCost}>{voucher.cost} Blood Points</Text>
              <Text style={styles.description}>{voucher.description}</Text>
            </View>

            {voucher.status === 'AVAILABLE' ? (
              <>
                <View style={styles.warningCard}>
                  <MaterialIcons name="access-time" color={COLORS.brand} size={25} />
                  <View style={styles.warningContent}>
                    <Text style={styles.warningTitle}>Activate only when ready</Text>
                    <Text style={styles.warningText}>
                      Only activate this voucher when you are already in front of the cashier or
                      counter.{`\n\n`}Once activated, the QR code will only remain active for 5
                      minutes.
                    </Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={activateVoucher}
                    style={({ pressed }) => [
                      styles.activateButton,
                      pressed && styles.activateButtonPressed,
                    ]}>
                    <Text style={styles.activateButtonText}>Activate Voucher</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {voucher.status === 'ACTIVE' ? (
              <>
                <View style={styles.qrCard}>
                  <View accessibilityLabel="Demo QR code" style={styles.qrPlaceholder}>
                    <MaterialIcons name="qr-code-2" color={COLORS.text} size={168} />
                  </View>
                  <Text style={styles.demoLabel}>DEMO QR</Text>
                  <Text style={styles.countdown}>
                    {formatRemaining(voucher.expiresAt, now)} remaining
                  </Text>
                  <Text numberOfLines={1} style={styles.tokenText}>
                    {voucher.token}
                  </Text>
                </View>

                <View style={styles.prototypeCard}>
                  <MaterialIcons name="info-outline" color={COLORS.brand} size={23} />
                  <View style={styles.prototypeContent}>
                    <Text style={styles.prototypeTitle}>Prototype Notice</Text>
                    <Text style={styles.prototypeText}>
                      This voucher and QR code are for system demonstration and testing only. They
                      are not connected to an actual cashier or merchant system.
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            {voucher.status === 'EXPIRED' ? (
              <>
                <View style={styles.expiredCard}>
                  <MaterialIcons name="timer-off" color={COLORS.muted} size={36} />
                  <Text style={styles.expiredTitle}>Voucher activation expired.</Text>
                  <Text style={styles.expiredText}>
                    The 5-minute QR activation window has ended.
                  </Text>
                </View>
                <View style={styles.detailsCard}>
                  <Text style={styles.detailsTitle}>Activation details</Text>
                  <Text style={styles.detailLabel}>Activated</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(voucher.activatedAt)}</Text>
                  <Text style={styles.detailLabel}>Expired</Text>
                  <Text style={styles.detailValue}>{formatTimestamp(voucher.expiresAt)}</Text>
                  <Text style={styles.expiredNotice}>
                    This prototype cannot determine whether a cashier accepted or used the voucher.
                  </Text>
                </View>
              </>
            ) : null}

            {voucher.status !== 'AVAILABLE' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.dismissTo('/my-vouchers')}
                style={({ pressed }) => [
                  styles.backToVouchersButton,
                  pressed && styles.activateButtonPressed,
                ]}>
                <Text style={styles.activateButtonText}>Back to My Vouchers</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  titleBlock: { alignItems: 'center' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: COLORS.softRed,
  },
  activeBadge: { backgroundColor: COLORS.activeBackground },
  expiredBadge: { backgroundColor: COLORS.expiredBackground },
  statusText: { color: COLORS.brand, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  activeStatusText: { color: COLORS.active },
  expiredStatusText: { color: COLORS.muted },
  voucherTitle: { marginTop: 13, color: COLORS.text, fontSize: 29, fontWeight: '800' },
  voucherCost: { marginTop: 5, color: COLORS.brand, fontSize: 14, fontWeight: '700' },
  description: {
    maxWidth: 430,
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: 19,
    backgroundColor: COLORS.warning,
  },
  warningContent: { flex: 1 },
  warningTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  warningText: { marginTop: 7, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  actionRow: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    minHeight: 50,
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  cancelButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: '800' },
  activateButton: {
    minHeight: 50,
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
  activateButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.99 }],
  },
  activateButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  qrCard: {
    alignItems: 'center',
    padding: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.white,
  },
  qrPlaceholder: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 8,
    borderColor: COLORS.white,
    borderRadius: 14,
    backgroundColor: '#FAFAF8',
  },
  demoLabel: {
    marginTop: 8,
    color: COLORS.brand,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  countdown: { marginTop: 12, color: COLORS.text, fontSize: 22, fontWeight: '800' },
  tokenText: { width: '100%', marginTop: 7, color: COLORS.muted, fontSize: 10, textAlign: 'center' },
  prototypeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 17,
    borderRadius: 18,
    backgroundColor: COLORS.softRed,
  },
  prototypeContent: { flex: 1 },
  prototypeTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  prototypeText: { marginTop: 5, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  expiredCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: COLORS.expiredBackground,
  },
  expiredTitle: { marginTop: 11, color: COLORS.text, fontSize: 19, fontWeight: '800' },
  expiredText: { marginTop: 6, color: COLORS.muted, fontSize: 14, textAlign: 'center' },
  detailsCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.white,
  },
  detailsTitle: { marginBottom: 13, color: COLORS.text, fontSize: 17, fontWeight: '800' },
  detailLabel: { marginTop: 7, color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  detailValue: { marginTop: 3, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  expiredNotice: { marginTop: 16, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  backToVouchersButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
});

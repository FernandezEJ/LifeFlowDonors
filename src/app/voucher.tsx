import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import VoucherQR from 'react-qr-code';
import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { ACTIVATION_WARNING, formatRemaining, remainingSeconds, type VoucherResponse } from '@/services/rewards';
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


// ========================================
// OWNED SERVER VOUCHER AND CLOCK
// Invalid IDs never fall back to another voucher. Each server response supplies
// a clock offset; foreground refresh hides the QR until ownership/status is checked.
// ========================================
export default function VoucherScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{id?: string}>();
  const voucherId = Number(id);
  const { voucher: getVoucher, activateVoucher } = useAuth();
  const [response, setResponse] = useState<VoucherResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const lock = useRef(false);
  const submitted = useRef(false);
  const deadlineRequested = useRef(false);
  const accept = useCallback((result: VoucherResponse) => {
    setResponse(result); setOffset(Date.parse(result.server_time) - Date.now()); setNow(Date.now());
    deadlineRequested.current = false;
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError('');
    if (!Number.isSafeInteger(voucherId) || voucherId <= 0) { setResponse(null); setError('Voucher not found.'); setLoading(false); return; }
    try { const result = await getVoucher(voucherId); if (current === generation.current) accept(result); }
    catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [getVoucher, voucherId, accept]);
  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else { generation.current++; setLoading(true); }
    });
    return () => { generation.current++; subscription.remove(); };
  }, [load]));
  const voucher = response?.voucher;
  const seconds = remainingSeconds(voucher?.expires_at ?? null, offset, now);

  // ========================================
  // VISUAL COUNTDOWN AND SERVER RECONCILIATION
  // Timer never writes a status. At zero the QR disappears and Laravel is refreshed.
  // A failed refresh exposes Retry, never a stale usable code.
  // ========================================
  useEffect(() => {
    if (voucher?.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [voucher?.status]);
  useEffect(() => {
    if (voucher?.status === 'active' && seconds === 0 && !loading && !error && !deadlineRequested.current) {
      deadlineRequested.current = true;
      // The request asynchronously replaces the visual state with the server result.
      void load();
    }
  }, [voucher?.status, seconds, loading, error, load]);

  // ========================================
  // EXPLICIT ACTIVATION WARNING
  // Duplicate dialogs and requests are locked; retries cannot extend the server deadline.
  // ========================================
  const activate = async () => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setError('');
    const current = generation.current;
    try { const result = await activateVoucher(voucherId); if (current === generation.current) accept(result); }
    catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { lock.current = false; submitted.current = false; setBusy(false); }
  };
  const confirm = () => {
    if (lock.current || loading || busy || voucher?.status !== 'available') return;
    lock.current = true;
    Alert.alert('Attention', ACTIVATION_WARNING, [
      { text: 'Cancel', style: 'cancel', onPress: () => { lock.current = false; } },
      { text: 'Activate', onPress: () => void activate() },
    ], { cancelable: false });
  };

  // ========================================
  // EXISTING WARNING, QR AND DETAILS LAYOUT
  // The encoded value is only an opaque server token. Five elapsed minutes count
  // as redemption for this capstone; no physical cashier scan is claimed.
  // ========================================
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.headerButton}><MaterialIcons name="arrow-back" color={COLORS.text} size={23} /></Pressable>
        <Text style={styles.headerTitle}>Voucher</Text><NotificationBell />
      </View></View>
      <ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.content}>
        {loading ? <Text>Loading voucher...</Text> : null}
        {error ? <View><Text accessibilityRole="alert">{error}</Text><Pressable disabled={busy} onPress={() => void load()}><Text>Retry</Text></Pressable></View> : null}
        {voucher ? <>
          <View style={styles.titleBlock}><View style={styles.statusBadge}><Text style={styles.statusText}>{voucher.status.toUpperCase()}</Text></View>
            <Text style={styles.voucherTitle}>{voucher.reward.name}</Text><Text style={styles.voucherCost}>{voucher.points_spent} Blood Points</Text><Text style={styles.description}>{voucher.reward.description}</Text></View>
          {voucher.status === 'available' ? <>
            <View style={styles.warningCard}><Text style={styles.warningText}>{ACTIVATION_WARNING}</Text></View>
            <View style={styles.actionRow}><Pressable style={styles.cancelButton} onPress={() => router.back()}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
              <Pressable disabled={busy || loading} onPress={confirm} style={styles.activateButton}><Text style={styles.activateButtonText}>{busy ? 'Activating...' : 'Activate'}</Text></Pressable></View>
          </> : null}
          {voucher.status === 'active' ? <View style={styles.qrCard}>
            {!loading && !error && seconds > 0 && voucher.qr_token ? <View style={{ padding: 16, backgroundColor: '#FFFFFF' }} accessibilityLabel="Active voucher QR code"><VoucherQR value={voucher.qr_token} size={184} /></View> : null}
            <Text style={styles.countdown}>{seconds > 0 ? formatRemaining(seconds) + ' remaining' : 'Activation window ended. Refreshing status...'}</Text>
          </View> : null}
          {voucher.status === 'redeemed' || voucher.status === 'expired' ? <View style={styles.expiredCard}>
            <Text style={styles.expiredTitle}>{voucher.status === 'redeemed' ? 'Voucher redeemed' : 'Voucher expired'}</Text>
            <Text style={styles.expiredText}>{voucher.status === 'redeemed' ? 'The 5-minute activation window has ended.' : 'This voucher is no longer available.'}</Text>
          </View> : null}
          <View style={styles.prototypeCard}><Text style={styles.prototypeText}>For this capstone, activation and the completed 5-minute window count as redemption. The QR is for presentation only; no cashier scanner is connected.</Text></View>
          {voucher.activated_at ? <View style={styles.detailsCard}><Text style={styles.detailsTitle}>Activation details</Text>
            <Text style={styles.detailValue}>Activated: {new Date(voucher.activated_at).toLocaleString()}</Text>
            <Text style={styles.detailValue}>Window ends: {voucher.expires_at ? new Date(voucher.expires_at).toLocaleString() : '--'}</Text>
            {voucher.redeemed_at ? <Text style={styles.detailValue}>Redeemed: {new Date(voucher.redeemed_at).toLocaleString()}</Text> : null}
          </View> : null}
        </> : null}
        <Pressable style={styles.backToVouchersButton} onPress={() => router.dismissTo('/my-vouchers')}><Text style={styles.activateButtonText}>Back to My Vouchers</Text></Pressable>
      </View></ScrollView>
    </SafeAreaView></>;
}
// Existing card, warning and button styles are retained.
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

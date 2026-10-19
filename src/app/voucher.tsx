import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { ACTIVATION_MESSAGE, usableClaimCode, voucherDate, voucherState, voucherStatusLabel, type VoucherResponse } from '@/services/rewards';
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
// OWNED SERVER VOUCHER
// Hide credentials while refetching, unfocused, or in the background. Associate
// every response with its account and ignore requests from an older screen/session.
// ========================================
export default function VoucherScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{id?: string}>();
  const voucherId = Number(id);
  const { voucher: getVoucher, activateVoucher, user } = useAuth();
  const accountId = user?.id;
  const [response, setResponse] = useState<(VoucherResponse & { accountId: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmActivation, setConfirmActivation] = useState(false);
  const generation = useRef(0);
  const lock = useRef(false);
  const submitted = useRef(false);
  const load = useCallback(async () => {
    const current = ++generation.current; setLoading(true); setError(''); setResponse(null);
    lock.current = false; setConfirmActivation(false);
    if (!accountId) { setLoading(false); return; }
    if (!Number.isSafeInteger(voucherId) || voucherId <= 0) { setResponse(null); setError('Voucher not found.'); setLoading(false); return; }
    try {
      const result = await getVoucher(voucherId);
      if (current === generation.current) {
        if (result.voucher.id !== voucherId) setError('Voucher not found.');
        else setResponse({ ...result, accountId });
      }
    }
    catch (cause) { if (current === generation.current) setError(errorMessage(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [getVoucher, voucherId, accountId]);
  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else { generation.current++; setResponse(null); setLoading(true); lock.current = false; setConfirmActivation(false); }
    });
    return () => { generation.current++; setResponse(null); lock.current = false; setConfirmActivation(false); subscription.remove(); };
  }, [load]));
  const voucher = accountId && response?.accountId === accountId && response.voucher.id === voucherId && !loading && !error ? response.voucher : undefined;
  const state = voucher ? voucherState(voucher) : undefined;
  const code = voucher ? usableClaimCode(voucher) : null;

  // ========================================
  // EXPLICIT ACTIVATION
  // Activation never updates points/stock. Refetch after a server success to catch
  // a concurrent staff claim; after a lost response, Retry reads the stable code.
  // ========================================
  const activate = async () => {
    if (!lock.current || submitted.current || loading || error || state !== 'available' || !accountId) return;
    submitted.current = true; setBusy(true); setError('');
    const current = generation.current;
    setResponse(null); setLoading(true);
    try {
      await activateVoucher(voucherId);
      if (current !== generation.current) return;
      const result = await getVoucher(voucherId);
      if (current === generation.current) {
        if (result.voucher.id !== voucherId) setError('Voucher not found.');
        else setResponse({ ...result, accountId });
      }
    }
    catch (cause) { if (current === generation.current) { setResponse(null); setError(errorMessage(cause)); } }
    finally {
      lock.current = false; submitted.current = false; setBusy(false);
      if (current === generation.current) setLoading(false);
    }
  };
  const confirm = () => {
    if (lock.current || submitted.current || loading || busy || error || state !== 'available') return;
    lock.current = true;
    setConfirmActivation(true);
  };

  // ========================================
  // EXISTING CARD AND DETAILS LAYOUT
  // Snapshot name/description come from the owned voucher, not the live catalog.
  // ========================================
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.headerButton}><MaterialIcons name="arrow-back" color={COLORS.text} size={23} /></Pressable>
        <Text style={styles.headerTitle}>Voucher</Text><NotificationBell />
      </View></View>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { if (!submitted.current) void load(); }} tintColor={COLORS.brand} />}><View style={styles.content}>
        {loading ? <Text accessibilityLiveRegion="polite">{busy ? 'Activating claim code...' : 'Loading voucher...'}</Text> : null}
        {error ? <View><Text accessibilityRole="alert">{error}</Text><Pressable disabled={busy} onPress={() => void load()}><Text>Retry</Text></Pressable></View> : null}
        {voucher ? <>
          <View style={styles.titleBlock}><View style={[styles.statusBadge, state === 'claimed' && styles.activeBadge, (state === 'legacy' || state === 'unavailable') && styles.expiredBadge]}><Text style={[styles.statusText, state === 'claimed' && styles.activeStatusText, (state === 'legacy' || state === 'unavailable') && styles.expiredStatusText]}>{voucherStatusLabel(voucher)}</Text></View>
            <Text style={styles.voucherTitle}>{voucher.reward.name}</Text><Text style={styles.voucherCost}>{voucher.points_spent} Blood Points</Text><Text style={styles.description}>{voucher.reward.description}</Text></View>
          {state === 'available' ? <>
            <View style={styles.warningCard}><Text style={styles.warningText}>{ACTIVATION_MESSAGE}</Text></View>
            <View style={styles.actionRow}><Pressable style={styles.cancelButton} onPress={() => router.back()}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || loading }} disabled={busy || loading} onPress={confirm} style={styles.activateButton}><Text style={styles.activateButtonText}>Activate Claim Code</Text></Pressable></View>
          </> : null}
          {state === 'pending_claim' ? <View style={styles.claimCodeCard}>
            <Text style={styles.detailsTitle}>Your one-time claim code</Text>
            {code ? <Text accessibilityLabel={`Claim code: ${code}`} selectable numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.claimCode}>{code}</Text> : <Text accessibilityRole="alert" style={styles.description}>Claim code unavailable. Pull down to refresh or try again later.</Text>}
            <Text style={styles.description}>Show this code to staff when collecting your item. It has no expiration. Staff will confirm your claim after handover.</Text>
          </View> : null}
          {state === 'claimed' || state === 'legacy' || state === 'unavailable' ? <View style={styles.expiredCard}>
            <Text style={styles.expiredTitle}>{state === 'claimed' ? 'Reward claimed' : state === 'legacy' ? 'Legacy voucher' : 'Voucher unavailable'}</Text>
            <Text style={styles.expiredText}>{state === 'claimed' ? 'Your claim was confirmed by staff.' : state === 'legacy' ? 'This is a record from the previous voucher flow. No claim code is available here.' : 'Claim information is unavailable. Pull down to refresh or try again later.'}</Text>
          </View> : null}
          {voucher.activated_at || state === 'claimed' ? <View style={styles.detailsCard}><Text style={styles.detailsTitle}>Voucher details</Text>
            {voucher.activated_at ? <Text style={styles.detailValue}>Activated: {voucherDate(voucher.activated_at)}</Text> : null}
            {state === 'claimed' ? <Text style={styles.detailValue}>Claimed: {voucherDate(voucher.claimed_at)}</Text> : null}
          </View> : null}
        </> : null}
        <Pressable accessibilityRole="button" style={styles.backToVouchersButton} onPress={() => router.dismissTo('/my-vouchers')}><Text style={styles.activateButtonText}>Back to My Rewards</Text></Pressable>
      </View></ScrollView>
    </SafeAreaView>
    <ConfirmationModal visible={confirmActivation && !!voucher && state === 'available'} icon="confirmation-number" variant="warning" title="Activate Claim Code" message={ACTIVATION_MESSAGE} secondaryLabel="Cancel" primaryLabel="Activate Claim Code" dismissible={false} onSecondary={()=>{setConfirmActivation(false);lock.current=false;}} onPrimary={()=>{setConfirmActivation(false);return activate();}} />
    </>;
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
  claimCodeCard: {
    alignItems: 'center',
    padding: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.white,
  },
  claimCode: { width: '100%', color: COLORS.brand, fontSize: 30, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
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

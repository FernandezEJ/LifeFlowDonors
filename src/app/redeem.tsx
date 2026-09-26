import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';
import { RewardCatalogue } from '@/components/reward-catalogue';
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
// EXISTING REDEEM ROUTE
// Shared catalogue uses real inventory, confirmation and server balance.
// ========================================
export default function RedeemScreen() {
  const router = useRouter();
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><MaterialIcons name="arrow-back" color={COLORS.text} size={23} /></Pressable>
        <Text style={styles.headerTitle}>Redeem</Text><NotificationBell />
      </View></View>
      <ScrollView contentContainerStyle={styles.listContent}><RewardCatalogue showBalance /></ScrollView>
    </SafeAreaView></>;
}
// Existing layout styles.
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


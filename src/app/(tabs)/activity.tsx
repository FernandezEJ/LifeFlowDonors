import { LifeFlowColors as PALETTE, DonationStatusColors } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';
import { NotificationBell } from '@/components/notification-bell';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { DONATION_STATUS, DONATION_STATUS_DESCRIPTION, type DonationPage, type DonationParticipation, type DonationStatus } from '@/services/donations';
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


// ========================================
// DONATION HISTORY STATE
// Focus/filter changes cancel stale responses; loading blocks duplicate page requests.
// ========================================
export default function ActivityScreen() {
  const router = useRouter();
  const scrollRef = useRef<FlatList<DonationParticipation>>(null);
  const opening = useRef(false);
  useFocusEffect(useCallback(() => {
    opening.current = false;
    scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []));
  const { donationHistory } = useAuth();
  const [status, setStatus] = useState<DonationStatus | undefined>();
  const [page, setPage] = useState<DonationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const lock = useRef(false);
  const retryMore = useRef(false);
  const previousStatus = useRef(status);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => {
    // Retry changes restart the focused history request.
    void refresh;
    const version = ++generation.current;
    retryMore.current = false;
    lock.current = true; setLoading(true); setError(''); if (previousStatus.current !== status) setPage(null); previousStatus.current = status;
    donationHistory(1, status).then(data => { if (generation.current === version) setPage(data); })
      .catch(e => { if (generation.current === version) setError(errorMessage(e)); })
      .finally(() => { if (generation.current === version) { lock.current = false; setLoading(false); } });
    return () => { generation.current++; };
  }, [donationHistory, status, refresh]));
  const more = async () => {
    if (lock.current || !page || page.current_page >= page.last_page) return;
    const version = generation.current;
    retryMore.current = true;
    lock.current = true; setLoading(true); setError('');
    try { const data = await donationHistory(page.current_page + 1, status);
      if (version === generation.current) setPage({ ...data, data: [...page.data, ...data.data] });
    } catch(e) { if (version === generation.current) setError(errorMessage(e)); }
    finally { if (version === generation.current) { lock.current = false; setLoading(false); } }
  };
  const openActivity = (item: DonationParticipation) => {
    // Block repeated taps during the transition; returning to this tab resets the guard.
    if (opening.current) return;
    opening.current = true;
    router.push({ pathname: '/activity/[id]', params: { id: String(item.id) } });
  };
  return <SafeAreaView edges={['top']} style={styles.safeArea}>
    <View style={styles.fixedHeader}><View style={styles.header}><Text style={styles.headerTitle}>Activity</Text>
      {/* Shared backend unread count refreshes on focus. */}<NotificationBell />
    </View></View>
    <FlatList ref={scrollRef} showsVerticalScrollIndicator={false} data={page?.data || []} keyExtractor={item => String(item.id)} contentContainerStyle={styles.listContent}
      ListHeaderComponent={<View style={styles.listHeader}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{([undefined, 'pending', 'for_verification', 'needs_revision', 'completed', 'rejected', 'cancelled'] as const).map(value => <Pressable key={value || 'all'} onPress={() => { if (value !== status) { setPage(null); setLoading(true); setStatus(value); } }} style={[styles.filterChip, value === status && styles.filterChipSelected]}><Text style={[styles.filterText, value === status && styles.filterTextSelected]}>{value ? DONATION_STATUS[value] : 'All'}</Text></Pressable>)}</ScrollView>
        <Text style={styles.historyTitle}>Joined activities {page ? '(' + page.total + ')' : ''}</Text>
        {error ? <LoadError message={error} subject="activities" loading={loading} onRetry={() => { if (retryMore.current) return more(); if (!lock.current) { lock.current = true; setRefresh(n => n + 1); } }} /> : null}
      </View>}
      ListEmptyComponent={loading && !page ? <TabSkeleton variant="activity" label="Loading activities" /> : !error && page ? <EmptyState icon="event-note"
        title={status ? 'No matching activities' : 'No donation activities yet'} description={status ? `No activities have the ${DONATION_STATUS[status]} status. Try another filter.` : 'Activities you join will appear here.'} /> : null}
      renderItem={({item}) => <Pressable accessibilityRole="button"
        accessibilityLabel={`View activity: ${item.opportunity.title}. ${DONATION_STATUS[item.status]}`}
        onPress={() => openActivity(item)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, styles.cardHeading]}>{item.opportunity.title}</Text>
          <MaterialIcons name="chevron-right" size={22} color={COLORS.brand} style={styles.cardChevron} accessible={false} />
        </View>
        <View style={styles.details}>
          <View style={styles.detailRow}><MaterialIcons name="calendar-today" size={17} color={PALETTE.primary} accessible={false} />
            <Text style={styles.detailText}>{item.opportunity.event_date || 'Confirm arrangements with the chapter'}</Text></View>
          {item.opportunity.location ? <View style={styles.detailRow}><MaterialIcons name="place" size={17} color={PALETTE.primary} accessible={false} />
            <Text style={styles.detailText}>{item.opportunity.location}</Text></View> : null}
        </View>
        <View style={styles.cardFooter}><View style={styles.statusBlock}>
          <View style={[styles.statusBadge, { backgroundColor: DonationStatusColors[item.status]?.surface ?? PALETTE.neutralSurface }]}>
            <Text style={[styles.statusText, { color: DonationStatusColors[item.status]?.text ?? PALETTE.neutralText }]}>{DONATION_STATUS[item.status]}</Text>
          </View>
          <Text style={styles.rewardLabel}>{DONATION_STATUS_DESCRIPTION[item.status]}</Text>
        </View></View>
      </Pressable>}
      ItemSeparatorComponent={() => <View style={styles.cardSeparator}/>}
      ListFooterComponent={page && page.current_page < page.last_page ? <Pressable disabled={loading} onPress={more} style={styles.viewButton}><Text style={styles.viewButtonText}>{loading ? 'Loading…' : 'Load more'}</Text></Pressable> : null}/>
  </SafeAreaView>;
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
  headerButtonPressed: { opacity: 0.7 },
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
  listContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  listHeader: { gap: 14, marginBottom: 12 },
  subtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  filters: { gap: 9, paddingRight: 4 },
  filterChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  filterChipSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  filterChipPressed: { opacity: 0.75 },
  filterText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: COLORS.white, fontWeight: '700' },
  historyHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  historyTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  historyCount: {
    minWidth: 26,
    height: 26,
    overflow: 'hidden',
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.softRed,
  },
  cardSeparator: { height: 13 },
  card: {
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 21,
    backgroundColor: COLORS.white,
    shadowColor: PALETTE.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardPressed: { opacity: 0.75 },
  cardHeading: { flex: 1, minWidth: 0 },
  cardChevron: { flexShrink: 0, marginTop: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  organizer: { marginTop: 4, color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  statusBadge: { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  statusText: { color: COLORS.text, fontSize: 12, lineHeight: 18, fontWeight: '800', flexShrink: 1 },
  statusBlock: { flex: 1, minWidth: 0, gap: 4 },
  details: { gap: 7, marginTop: 15 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { flex: 1, minWidth: 0, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rewardBlock: { flex: 1 },
  rewardLabel: { color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  rewardValue: { marginTop: 3, color: COLORS.brand, fontSize: 14, fontWeight: '800' },
  cancelledReward: { color: COLORS.muted },
  viewButton: {
    minHeight: 42,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
  },
  viewButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.98 }] },
  viewButtonText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
});

// TODO: Donation reward rules will later be provided and validated by Laravel/backend configuration.

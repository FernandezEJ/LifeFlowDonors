import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { useNotifications } from '@/contexts/notification-context';
import { errorMessage } from '@/services/api';
import { notificationDestination, notificationTimeLabel, type ImportantNotification, type NotificationPage } from '@/services/notifications';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';

const COLORS = {
  background: PALETTE.cream, brand: PALETTE.primary, text: PALETTE.text, muted: PALETTE.neutral,
  border: PALETTE.border, white: PALETTE.surface,
};

// ========================================
// SERVER-OWNED NOTIFICATION HISTORY
// Retains the existing cards and filters, with real pagination/read state.
// Focus/filter changes discard stale responses and reload the owned inbox.
// ========================================
export default function NotificationsScreen() {
  const router = useRouter();
  const { listNotifications, readNotification, readAllNotifications } = useAuth();
  const { unreadCount, refreshCount } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ImportantNotification | null>(null);
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const focused = useRef(false);
  const filterRef = useRef(false);
  const loadingPage = useRef(false);
  const retryRequest = useRef({ page: 1, append: false });
  const actionLock = useRef(false);
  const load = useCallback(async (pageNumber = 1, append = false) => {
    if (!focused.current || filterRef.current !== unreadOnly) return;
    if (loadingPage.current) return;
    const current = append ? generation.current : ++generation.current;
    loadingPage.current = true;
    retryRequest.current = { page: pageNumber, append };
    setLoading(true); setError('');
    try {
      const result = await listNotifications(pageNumber, unreadOnly);
      if (generation.current !== current) return;
      setPage(previous => append && previous
        ? { ...result, data: [...previous.data, ...result.data.filter(item => !previous.data.some(old => old.id === item.id))] }
        : result);
      void refreshCount(true);
    } catch (e) { if (generation.current === current) setError(errorMessage(e)); }
    finally { if (generation.current === current) { setLoading(false); loadingPage.current = false; } }
  }, [listNotifications, unreadOnly, refreshCount]);
  useFocusEffect(useCallback(() => {
    focused.current = true; setBusy(actionLock.current); setNow(Date.now());
    void load();
    return () => { focused.current = false; generation.current++; loadingPage.current = false; };
  }, [load]));

  // ========================================
  // CONFIRMED READ ACTIONS AND AUTHENTICATED NAVIGATION
  // Do not pretend a read succeeded during a network failure.
  // ========================================
  const act = async (operation: (current: () => boolean) => Promise<void>) => {
    if (actionLock.current || !focused.current || filterRef.current !== unreadOnly) return;
    const version = generation.current;
    const current = () => focused.current && generation.current === version;
    actionLock.current = true; setBusy(true); setError('');
    try { await operation(current); } catch (e) { if (current()) setError(errorMessage(e)); }
    finally { actionLock.current = false; if (focused.current) setBusy(false); }
  };
  const openNotification = (item: ImportantNotification) => void act(async current => {
    const result = await readNotification(item.id);
    if (!current()) return;
    setPage(previous => previous ? { ...previous, data: previous.data.map(row => row.id === item.id ? result.notification : row) } : previous);
    await refreshCount(true);
    if (!current()) return;
    const destination = notificationDestination(result.notification);
    if (destination) router.push(destination);
    else {
      setDetail(result.notification);
      // Reading removes a row from Unread; restart its server pagination to avoid skipping rows.
      if (unreadOnly) await load();
    }
  });
  const markAllRead = () => void act(async current => {
    if (unreadCount === 0) return;
    await readAllNotifications();
    if (!current()) return;
    await refreshCount(true);
    if (current()) await load();
  });

  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.iconButton}>
          <MaterialIcons name="arrow-back" color={COLORS.text} size={24} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Notifications</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Notification Settings" style={styles.iconButton}
          onPress={() => router.push('/notification-settings')}>
          <MaterialIcons name="settings" color={COLORS.brand} size={24} />
        </Pressable>
      </View></View>
      <FlatList contentContainerStyle={styles.listContent} data={(page?.data || []).filter(item => !unreadOnly || !item.read_at)}
        keyExtractor={item => String(item.id)} ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshing={loading} onRefresh={() => void load()}
        ListHeaderComponent={<>
          <View style={styles.filterBar}>{[false, true].map(filter => <Pressable key={String(filter)}
            accessibilityRole="button" accessibilityState={{ selected: filter === unreadOnly }}
            onPress={() => {
              if (filter !== unreadOnly) {
                generation.current++; filterRef.current = filter; loadingPage.current = false;
                setPage(null); setDetail(null); setUnreadOnly(filter);
              }
            }} style={[styles.filterChip, filter === unreadOnly && styles.filterChipSelected]}>
            <Text style={[styles.filterText, filter === unreadOnly && styles.filterTextSelected]}>{filter ? 'Unread (' + unreadCount + ')' : 'All'}</Text>
          </Pressable>)}
            <Pressable accessibilityRole="button" accessibilityLabel="Mark all read" accessibilityState={{ disabled: busy || unreadCount === 0 }}
              disabled={busy || unreadCount === 0} onPress={markAllRead} style={styles.markAllButton}>
              <Text style={[styles.markAllText, (busy || unreadCount === 0) && styles.markAllTextDisabled]}>Mark all read</Text>
            </Pressable>
          </View>
          {error ? <LoadError message={error} subject="notifications" retryLabel="Retry notifications" loading={loading || busy} onRetry={() => load(retryRequest.current.page, retryRequest.current.append)} /> : null}
        </>}
        ListEmptyComponent={loading && !page ? <TabSkeleton variant="notifications" label="Loading notifications" /> : !error && page ?
          <EmptyState icon="notifications-none" title={unreadOnly ? "You're all caught up!" : 'No notifications yet'}
            description={unreadOnly ? 'You have no unread notifications.' : 'Your LifeFlow updates will appear here.'} /> : null}
        ListFooterComponent={page && page.current_page < page.last_page ? <Pressable accessibilityRole="button" disabled={loading}
          onPress={() => void load(page.current_page + 1, true)} style={styles.textButton}>
          <Text style={styles.markAllText}>{loading ? 'Loading...' : 'Load more'}</Text>
        </Pressable> : null}
        renderItem={({ item }) => {
          const target = notificationDestination(item), icon = notificationIcon(item.type);
          const timestamp = notificationTimeLabel(item.created_at, now);
          return <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }}
            accessibilityLabel={`${item.read_at ? '' : 'Unread. '}${item.title}. ${item.message}. ${timestamp}`}
            accessibilityHint={target ? 'Opens the related LifeFlow details.' : 'Shows the complete notification message.'}
            onPress={() => openNotification(item)} style={({ pressed }) => [styles.notificationCard, !item.read_at && styles.notificationUnread, pressed && styles.pressed]}>
            <View style={[styles.typeIcon, { backgroundColor: icon.surface }]}>
              <MaterialIcons name={icon.name} color={icon.color} size={23} accessible={false} /></View>
            <View style={styles.notificationContent}><View style={styles.titleRow}>
              <Text style={[styles.cardTitle, !item.read_at && styles.cardTitleUnread]}>{item.title}</Text>
              {!item.read_at ? <View style={styles.unreadDot} accessible={false} /> : null}
            </View><Text numberOfLines={2} style={styles.cardMessage}>{item.message}</Text><Text style={styles.cardDate}>{timestamp}</Text></View>
            {target ? <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} accessible={false} style={styles.chevron} /> : null}
          </Pressable>;
        }}
      />
      <Modal visible={detail !== null} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <SafeAreaView style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.detailCard}>
          <Text accessibilityRole="header" style={styles.detailTitle}>{detail?.title}</Text>
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
            <Text selectable style={styles.detailMessage}>{detail?.message}</Text>
          </ScrollView>
          <Text style={styles.cardDate}>{notificationTimeLabel(detail?.created_at, now)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close notification" onPress={() => setDetail(null)} style={styles.textButton}>
            <Text style={styles.markAllText}>Close</Text></Pressable>
        </View></SafeAreaView>
      </Modal>
    </SafeAreaView></>;
}

function notificationIcon(type: ImportantNotification['type']) {
  switch (type) {
    case 'admin_announcement': return { name: 'campaign', color: PALETTE.primary, surface: PALETTE.selected } as const;
    case 'donation_completed': return { name: 'verified', color: PALETTE.successText, surface: PALETTE.successSurface } as const;
    case 'donation_cooldown_complete': return { name: 'favorite-border', color: PALETTE.successText, surface: PALETTE.successSurface } as const;
    case 'donation_rejected': return { name: 'cancel', color: PALETTE.danger, surface: PALETTE.dangerSurface } as const;
    case 'donation_needs_revision': return { name: 'edit-note', color: PALETTE.revisionText, surface: PALETTE.revisionSurface } as const;
    case 'donation_reminder': return { name: 'event', color: PALETTE.pendingText, surface: PALETTE.pendingSurface } as const;
    default: return { name: 'notifications-none', color: PALETTE.primary, surface: PALETTE.selected } as const;
  }
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  fixedHeader: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  header: { width: '100%', maxWidth: 620, minHeight: 60, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 21, fontWeight: '800' },
  markAllButton: { marginLeft: 'auto', minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  markAllText: { color: COLORS.brand, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  markAllTextDisabled: { color: COLORS.muted, opacity: 0.6 },
  textButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  listContent: { width: '100%', maxWidth: 620, flexGrow: 1, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 30 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 18 },
  filterChip: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  filterChipSelected: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  filterText: { color: COLORS.text, fontSize: 13, lineHeight: 20, fontWeight: '700' },
  filterTextSelected: { color: COLORS.white },
  separator: { height: 12 },
  notificationCard: { minHeight: 96, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, backgroundColor: COLORS.white },
  notificationUnread: { backgroundColor: PALETTE.selected },
  pressed: { opacity: 0.75 },
  typeIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  notificationContent: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  cardTitleUnread: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand },
  cardMessage: { marginTop: 5, color: PALETTE.neutralText, fontSize: 13, lineHeight: 20 },
  cardDate: { marginTop: 8, color: PALETTE.neutral, fontSize: 12, lineHeight: 18 },
  chevron: { alignSelf: 'center' },
  error: { marginBottom: 14 }, errorText: { color: PALETTE.danger, fontSize: 13, lineHeight: 20 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 70 },
  emptyText: { marginTop: 10, color: COLORS.muted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20 },
  detailCard: { width: '100%', maxWidth: 580, maxHeight: '85%', alignSelf: 'center', borderRadius: 22, backgroundColor: COLORS.white, padding: 20, gap: 8 },
  detailTitle: { color: COLORS.text, fontSize: 19, lineHeight: 26, fontWeight: '800' },
  detailScroll: { flexShrink: 1 }, detailContent: { paddingVertical: 4 },
  detailMessage: { color: COLORS.text, fontSize: 15, lineHeight: 24 },
});

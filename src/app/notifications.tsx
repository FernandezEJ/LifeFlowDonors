import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/auth-context';
import { useNotifications } from '@/contexts/notification-context';
import { errorMessage } from '@/services/api';
import { notificationDestination, type ImportantNotification, type NotificationPage } from '@/services/notifications';

const COLORS = {
  background: '#FFF9F2', brand: '#D93A3A', text: '#372E2E', muted: '#766A68',
  border: '#F0E2DC', white: '#FFFFFF', softRed: '#FDE8E8', pinned: '#FFF0ED',
};

// ========================================
// SERVER-OWNED NOTIFICATION HISTORY
// Retains the existing cards and filters, with real pagination/read state.
// Focus/filter changes discard stale responses and reload the owned inbox.
// ========================================
export default function NotificationsScreen() {
  const router = useRouter();
  const { listNotifications, readNotification, readAllNotifications } = useAuth();
  const { unreadCount, refreshCount, enablePush, pushStatus } = useNotifications();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const loadingPage = useRef(false);
  const actionLock = useRef(false);
  const load = useCallback(async (pageNumber = 1, append = false) => {
    if (append && loadingPage.current) return;
    const current = append ? generation.current : ++generation.current;
    loadingPage.current = true;
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
    void load();
    return () => { generation.current++; loadingPage.current = false; };
  }, [load]));

  // ========================================
  // CONFIRMED READ ACTIONS AND AUTHENTICATED NAVIGATION
  // Do not pretend a read succeeded during a network failure.
  // ========================================
  const act = async (operation: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError('');
    try { await operation(); } catch (e) { setError(errorMessage(e)); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const openNotification = (item: ImportantNotification) => void act(async () => {
    const result = await readNotification(item.id);
    setPage(previous => previous ? { ...previous, data: previous.data.map(row => row.id === item.id ? result.notification : row) } : previous);
    await refreshCount(true);
    const destination = notificationDestination(result.notification);
    if (destination) router.push(destination);
  });
  const markAllRead = () => void act(async () => {
    await readAllNotifications(); await refreshCount(true); await load();
  });

  // ========================================
  // EXISTING INBOX DESIGN WITH LOADING, RETRY AND OPT-IN
  // No sample notifications or navigation to invented activity IDs remain.
  // ========================================
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top','bottom']} style={styles.safeArea}>
      <View style={styles.fixedHeader}><View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" color={COLORS.text} size={23} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable disabled={busy || unreadCount === 0} onPress={markAllRead} style={styles.markAllButton}>
          <Text style={[styles.markAllText, (busy || unreadCount === 0) && styles.markAllTextDisabled]}>Mark all read</Text>
        </Pressable>
      </View></View>
      <FlatList contentContainerStyle={styles.listContent} data={(page?.data || []).filter(item => !unreadOnly || !item.read_at)}
        keyExtractor={item => String(item.id)} ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshing={loading} onRefresh={() => void load()}
        ListHeaderComponent={<>
          <View style={styles.filterBar}>{[false,true].map(filter => <Pressable key={String(filter)}
            accessibilityRole="button" accessibilityState={{ selected: filter === unreadOnly }}
            onPress={() => { if (filter !== unreadOnly) { setPage(null); setUnreadOnly(filter); } }}
            style={[styles.filterChip, filter === unreadOnly && styles.filterChipSelected]}>
            <Text style={[styles.filterText, filter === unreadOnly && styles.filterTextSelected]}>{filter ? 'Unread ('+unreadCount+')' : 'All'}</Text>
          </Pressable>)}</View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void act(enablePush)} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Enable important notifications</Text>
          </Pressable>
          {pushStatus ? <Text style={styles.cardMessage}>{pushStatus}</Text> : null}
          {error ? <Pressable onPress={() => void load()}><Text accessibilityRole="alert" style={styles.cardMessage}>{error} Tap to retry.</Text></Pressable> : null}
        </>}
        ListEmptyComponent={<View style={styles.emptyState}><MaterialIcons name="notifications-none" color={COLORS.muted} size={34}/>
          <Text style={styles.emptyText}>{loading ? 'Loading notifications...' : error ? 'Notifications could not be loaded.' : unreadOnly ? "You're all caught up." : 'No notifications yet.'}</Text>
        </View>}
        ListFooterComponent={page && page.current_page < page.last_page ? <Pressable disabled={loading}
          onPress={() => void load(page.current_page+1,true)} style={styles.markAllButton}>
          <Text style={styles.markAllText}>{loading ? 'Loading...' : 'Load more'}</Text>
        </Pressable> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="button" disabled={busy} onPress={() => openNotification(item)}
          style={[styles.notificationCard, !item.read_at && styles.notificationUnread]}>
          <View style={styles.typeIcon}><MaterialIcons name={item.type === 'admin_announcement' ? 'campaign' : item.type === 'donation_completed' ? 'verified' : 'error-outline'} color={COLORS.brand} size={23}/></View>
          <View style={styles.notificationContent}><View style={styles.titleRow}>
            <Text style={[styles.cardTitle,!item.read_at && styles.cardTitleUnread]}>{item.title}</Text>
            {!item.read_at ? <View style={styles.unreadDot}/> : null}
          </View><Text style={styles.cardMessage}>{item.message}</Text><Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text></View>
        </Pressable>}
      />
    </SafeAreaView></>;
}

// ========================================
// EXISTING NOTIFICATION SCREEN STYLES
// Preserves the established card, typography, and color treatment.
// ========================================
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
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '800' },
  markAllButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
  },
  markAllText: { color: COLORS.brand, fontSize: 11, fontWeight: '800' },
  markAllTextDisabled: { color: COLORS.muted, opacity: 0.55 },
  listContent: {
    width: '100%',
    maxWidth: 620,
    flexGrow: 1,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
  },
  filterChip: {
    minHeight: 39,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  filterChipSelected: { backgroundColor: COLORS.brand },
  filterText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: COLORS.white, fontWeight: '800' },
  separator: { height: 11 },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.white,
  },
  notificationUnread: { backgroundColor: '#FFF7F3' },
  notificationPinned: { borderColor: '#EAB0A9', backgroundColor: COLORS.pinned },
  cardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  typeIcon: {
    width: 43,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.softRed,
  },
  notificationContent: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardTitleUnread: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand },
  pinnedLabel: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: COLORS.softRed,
  },
  pinnedText: { color: COLORS.brand, fontSize: 9, fontWeight: '800' },
  cardMessage: { marginTop: 7, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  cardDate: { marginTop: 8, color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 70 },
  emptyText: { marginTop: 10, color: COLORS.muted, fontSize: 14, fontWeight: '600' },
});

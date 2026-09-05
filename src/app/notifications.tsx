import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  text: '#372E2E',
  muted: '#766A68',
  border: '#F0E2DC',
  white: '#FFFFFF',
  softRed: '#FDE8E8',
  pinned: '#FFF0ED',
};

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];
type NotificationFilter = 'ALL' | 'UNREAD';
type NotificationType =
  | 'announcement'
  | 'activity'
  | 'verification'
  | 'points'
  | 'voucher'
  | 'status'
  | 'achievement';

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  date: string;
  read: boolean;
  pinned?: boolean;
  sortOrder: number;
};

const TYPE_ICONS: Record<NotificationType, MaterialIconName> = {
  announcement: 'campaign',
  activity: 'event',
  verification: 'verified',
  points: 'stars',
  voucher: 'confirmation-number',
  status: 'monitor-heart',
  achievement: 'workspace-premium',
};

const INITIAL_NOTIFICATIONS: readonly NotificationItem[] = [
  {
    id: '1',
    type: 'announcement',
    title: 'Community Bloodletting Activity',
    message: 'LifeFlow Admin posted a new blood donation activity. Tap to view details.',
    date: 'Today',
    read: false,
    pinned: true,
    sortOrder: 7,
  },
  {
    id: '2',
    type: 'verification',
    title: 'Donation Verified',
    message: 'Your donation proof has been verified. 350 Blood Points were added.',
    date: 'Today',
    read: false,
    sortOrder: 6,
  },
  {
    id: '3',
    type: 'activity',
    title: 'Donation Activity Reminder',
    message: 'Your Community Bloodletting Activity is coming up soon.',
    date: 'Today',
    read: true,
    sortOrder: 5,
  },
  {
    id: '4',
    type: 'points',
    title: 'Blood Points Added',
    message: 'Your latest verified donation earned 350 Blood Points.',
    date: 'Yesterday',
    read: true,
    sortOrder: 4,
  },
  {
    id: '5',
    type: 'status',
    title: 'Status Updated',
    message: 'Your latest evaluation result is now available.',
    date: 'Yesterday',
    read: true,
    sortOrder: 3,
  },
  {
    id: '6',
    type: 'voucher',
    title: 'Voucher Expired',
    message: 'Your 5-minute voucher activation window has ended.',
    date: 'Yesterday',
    read: true,
    sortOrder: 2,
  },
  {
    id: '7',
    type: 'achievement',
    title: 'Silver Donor Unlocked',
    message: 'You reached the Silver Donor milestone.',
    date: 'September 3, 2026',
    read: true,
    sortOrder: 1,
  },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    ...INITIAL_NOTIFICATIONS,
  ]);
  const [selectedFilter, setSelectedFilter] = useState<NotificationFilter>('ALL');
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const visibleNotifications = useMemo(
    () =>
      notifications
        .filter((notification) => selectedFilter === 'ALL' || !notification.read)
        .sort(
          (first, second) =>
            Number(Boolean(second.pinned)) - Number(Boolean(first.pinned)) ||
            second.sortOrder - first.sortOrder,
        ),
    [notifications, selectedFilter],
  );

  const markAllRead = () => {
    if (unreadCount === 0) return;
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true })),
    );
  };

  const openNotification = (notification: NotificationItem) => {
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );

    switch (notification.type) {
      case 'announcement':
        // TODO: Open the announcement supplied by the backend when destination data is available.
        Alert.alert(notification.title, 'Announcement details will be connected later.');
        break;
      case 'activity':
        router.push({ pathname: '/activity/[id]', params: { id: '1' } });
        break;
      case 'verification':
        router.push({ pathname: '/activity/[id]', params: { id: '2' } });
        break;
      case 'points':
        router.navigate('/(tabs)/points');
        break;
      case 'voucher':
        router.navigate('/my-vouchers');
        break;
      case 'status':
        router.navigate('/(tabs)/status');
        break;
      case 'achievement':
        router.navigate('/(tabs)/profile');
        break;
    }
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
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <MaterialIcons name="arrow-back" color={COLORS.text} size={23} />
            </Pressable>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: unreadCount === 0 }}
              disabled={unreadCount === 0}
              hitSlop={7}
              onPress={markAllRead}
              style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}>
              <Text style={[styles.markAllText, unreadCount === 0 && styles.markAllTextDisabled]}>
                Mark all read
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleNotifications}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(notification) => notification.id}
          ListHeaderComponent={
            <View style={styles.filterBar}>
              {(['ALL', 'UNREAD'] as const).map((filter) => {
                const selected = selectedFilter === filter;
                const label = filter === 'ALL' ? 'All' : `Unread (${unreadCount})`;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={filter}
                    onPress={() => setSelectedFilter(filter)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      selected && styles.filterChipSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons
                name={selectedFilter === 'UNREAD' ? 'done-all' : 'notifications-none'}
                color={COLORS.muted}
                size={34}
              />
              <Text style={styles.emptyText}>
                {selectedFilter === 'UNREAD' ? "You're all caught up." : 'No notifications yet.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => openNotification(item)}
              style={({ pressed }) => [
                styles.notificationCard,
                !item.read && styles.notificationUnread,
                item.pinned && styles.notificationPinned,
                pressed && styles.cardPressed,
              ]}>
              <View style={styles.typeIcon}>
                <MaterialIcons name={TYPE_ICONS[item.type]} color={COLORS.brand} size={23} />
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.titleRow}>
                  <Text style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}>
                    {item.title}
                  </Text>
                  {!item.read ? <View style={styles.unreadDot} /> : null}
                </View>
                {item.pinned ? (
                  <View style={styles.pinnedLabel}>
                    <MaterialIcons name="push-pin" color={COLORS.brand} size={12} />
                    <Text style={styles.pinnedText}>Pinned</Text>
                  </View>
                ) : null}
                <Text style={styles.cardMessage}>{item.message}</Text>
                <Text style={styles.cardDate}>{item.date}</Text>
              </View>
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />

        {/* TODO: Laravel/Firebase will later manage notification records, push delivery,
            read state, mark-all-read, pinned announcements, active-duration expiration, and
            destination data. Expired announcements must no longer remain pinned. */}
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

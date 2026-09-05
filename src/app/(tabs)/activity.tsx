import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
};

type ActivityStatus = 'PENDING' | 'FOR_VERIFICATION' | 'COMPLETED' | 'CANCELLED';
type ActivityFilter = 'ALL' | 'PENDING' | 'FOR_VERIFICATION' | 'COMPLETED';

type ActivityRecord = {
  id: string;
  title: string;
  organizer: string;
  date: string;
  location?: string;
  status: ActivityStatus;
  reward: string;
};

const ACTIVITIES: readonly ActivityRecord[] = [
  {
    id: '1',
    title: 'Community Bloodletting Activity',
    organizer: 'LifeFlow',
    date: 'September 12, 2026',
    location: 'Sample Community Center',
    status: 'PENDING',
    reward: '550 Blood Points',
  },
  {
    id: '2',
    title: 'Philippine Red Cross Donation',
    organizer: 'Philippine Red Cross',
    date: 'June 10, 2026',
    location: 'Philippine Red Cross Blood Center',
    status: 'COMPLETED',
    reward: '350 Blood Points',
  },
  {
    id: '3',
    title: 'University Blood Donation Day',
    organizer: 'LifeFlow',
    date: 'August 22, 2026',
    location: 'University Activity Hall',
    status: 'FOR_VERIFICATION',
    reward: '450 Blood Points',
  },
  {
    id: '4',
    title: 'Community Mobile Blood Drive',
    organizer: 'LifeFlow',
    date: 'May 18, 2026',
    status: 'CANCELLED',
    reward: 'Not awarded',
  },
];

const FILTERS: readonly { label: string; value: ActivityFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'For Verification', value: 'FOR_VERIFICATION' },
  { label: 'Completed', value: 'COMPLETED' },
];

const STATUS_STYLES: Record<
  ActivityStatus,
  { background: string; color: string; label: string }
> = {
  PENDING: { background: '#FFF1D6', color: '#A76500', label: 'Pending' },
  FOR_VERIFICATION: { background: '#E6F0FF', color: '#3469A5', label: 'For Verification' },
  COMPLETED: { background: '#E2F5E9', color: '#287A47', label: 'Completed' },
  CANCELLED: { background: '#F1ECEA', color: '#8A5F59', label: 'Cancelled' },
};

type ActivityCardProps = {
  activity: ActivityRecord;
  onView: () => void;
};

function ActivityCard({ activity, onView }: ActivityCardProps) {
  const statusStyle = STATUS_STYLES[activity.status];
  const rewardLabel =
    activity.status === 'COMPLETED'
      ? 'Earned reward'
      : activity.status === 'CANCELLED'
        ? 'Reward'
        : 'Expected reward';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{activity.title}</Text>
          <Text style={styles.organizer}>{activity.organizer}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.background }]}>
          <Text style={[styles.statusText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <MaterialIcons name="event" color={COLORS.brand} size={18} />
          <Text style={styles.detailText}>{activity.date}</Text>
        </View>
        {activity.location ? (
          <View style={styles.detailRow}>
            <MaterialIcons name="location-on" color={COLORS.brand} size={18} />
            <Text style={styles.detailText}>{activity.location}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.rewardBlock}>
          <Text style={styles.rewardLabel}>{rewardLabel}</Text>
          <Text
            style={[
              styles.rewardValue,
              activity.status === 'CANCELLED' && styles.cancelledReward,
            ]}>
            {activity.reward}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`View ${activity.title}`}
          accessibilityRole="button"
          onPress={onView}
          style={({ pressed }) => [styles.viewButton, pressed && styles.viewButtonPressed]}>
          <Text style={styles.viewButtonText}>View</Text>
          <MaterialIcons name="chevron-right" color={COLORS.white} size={19} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('ALL');

  const filteredActivities = useMemo(
    () =>
      selectedFilter === 'ALL'
        ? ACTIVITIES
        : ACTIVITIES.filter((activity) => activity.status === selectedFilter),
    [selectedFilter],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Activity</Text>
          <Pressable
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.bellButton, pressed && styles.headerButtonPressed]}>
            <MaterialIcons name="notifications-none" color={COLORS.text} size={25} />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredActivities}
        keyExtractor={(activity) => activity.id}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>Track your donation activities</Text>

            <ScrollView
              contentContainerStyle={styles.filters}
              horizontal
              showsHorizontalScrollIndicator={false}>
              {FILTERS.map((filter) => {
                const selected = filter.value === selectedFilter;

                return (
                  <Pressable
                    accessibilityRole="button"
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
            </ScrollView>

            <View style={styles.historyHeading}>
              <Text style={styles.historyTitle}>Your participation</Text>
              <Text style={styles.historyCount}>{filteredActivities.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ActivityCard
            activity={item}
            onView={() =>
              router.push({
                pathname: '/activity/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
        showsVerticalScrollIndicator={false}
      />
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
  listHeader: { gap: 20, marginBottom: 12 },
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
    shadowColor: '#6E514C',
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
  cardHeading: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  organizer: { marginTop: 4, color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  details: { gap: 7, marginTop: 15 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
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
  rewardLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  rewardValue: { marginTop: 3, color: COLORS.brand, fontSize: 14, fontWeight: '800' },
  cancelledReward: { color: COLORS.muted },
  viewButton: {
    minHeight: 42,
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

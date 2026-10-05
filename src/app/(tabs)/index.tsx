import { TabSkeleton } from '@/components/tab-skeleton';
import { HomeDonationReminder } from '@/components/home-donation-reminder';
import { FLOWIE_MASCOTS, HOME_MASCOT_CYCLE } from '@/constants/flowie-mascots';
import { NotificationBell } from '@/components/notification-bell';
import {useAuth} from '@/contexts/auth-context';
import { announcementImageUrl, formatDonationDate, formatJoinedDate } from '@/services/announcement-presentation';
import {boardItems, DONATION_STATUS, type DonationParticipation, type DonationOpportunity} from '@/services/donations';
import {errorMessage} from '@/services/api';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  softRed: '#FDE7E3',
  white: '#FFFFFF',
};

const FLOWIE_MESSAGES = [
  'Need help with LifeFlow? Ask me anything.',
  'Want to check your status? I can guide you.',
  'Need help with points? I can explain them.',
  'Have a donation question? Ask Flowie anytime.',
] as const;

const GUIDE_STEPS = [
  ['Check Your Status', 'Complete the eligibility evaluation in the Status tab.'],
  ['Join Activities', 'View available blood donation activities.'],
  ['Earn Blood Points', 'Verified donations can earn points and rewards.'],
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  const { width, fontScale = 1 } = useWindowDimensions();
  const [bubbleMeasurement, setBubbleMeasurement] = useState({ width, fontScale, height: 0 });
  const bubbleHeight = Math.max(Math.ceil(72 * Math.max(1, fontScale)),
    bubbleMeasurement.width === width && bubbleMeasurement.fontScale === fontScale ? Math.ceil(bubbleMeasurement.height + 18) : 0);
  const [flowieMessageIndex, setFlowieMessageIndex] = useState(0);
  const compactFlowie = width < 340;
  // ========================================
  // LIVE ANNOUNCEMENT BOARD
  // Reloads on focus and periodically; expiration removes only the board item.
  // The Red Cross system card stays present even when loading fails.
  // ========================================
  const [boardLoading, setBoardLoading] = useState(true);
  const { opportunities, donationHistory, profile, loadProfile } = useAuth();
  const [posts, setPosts] = useState<DonationOpportunity[]>([]);
  const [boardError, setBoardError] = useState('');
  const [recent, setRecent] = useState<DonationParticipation | null>(null);
  const [activityError, setActivityError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    let active = true;
    let refreshing = false;
    const load = async () => {
      if (refreshing) return;
      refreshing = true;
      await Promise.allSettled([
        // Session restoration initially has only the user. Hydrate the shared profile on Home too.
        loadProfile(),
        opportunities().then(result => {
          if (active) { setPosts(result.data); setBoardError(''); }
        }).catch(error => { if (active) setBoardError(errorMessage(error)); }),
        donationHistory(1).then(result => {
          if (active) { setRecent(result.data[0] ?? null); setActivityError(''); }
        }).catch(error => { if (active) setActivityError(errorMessage(error)); }),
      ]);
      refreshing = false;
      if (active) setBoardLoading(false);
    };
    void load();
    const refresh = setInterval(() => void load(), 30000);
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => { active = false; clearInterval(refresh); clearInterval(tick); };
  }, [opportunities, donationHistory, loadProfile]));
  const board = boardItems(posts, clock).slice(0, 2);
  const firstName = profile?.first_name?.trim();
  const [mascotIndex, setMascotIndex] = useState(0);

  useFocusEffect(useCallback(() => {
    setMascotIndex(0);
    const timer = setInterval(() => {
      setMascotIndex(index => (index + 1) % HOME_MASCOT_CYCLE.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []));

  useEffect(() => {
    const intervalId = setInterval(() => {
      setFlowieMessageIndex((currentIndex) => (currentIndex + 1) % FLOWIE_MESSAGES.length);
    }, 4500);

    return () => clearInterval(intervalId);
  }, []);

  const openFlowie = () => {
    router.push('/flowie');
  };


  const openRedCrossOption = () => {
    router.push({ pathname: '/announcement/[id]', params: { id: 'red-cross-dagupan' } });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <HomeDonationReminder />
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.brandTitle}>LifeFlow</Text>
          {/* Shared backend unread count refreshes on focus. */}<NotificationBell />
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {boardLoading ? <TabSkeleton /> : <>
          <View style={styles.flowieSection}>
          <View style={styles.greetingBlock}>
            {firstName ? <Text style={styles.greetingTitle}>Hello, {firstName}</Text> :
              <View accessibilityRole="progressbar" accessibilityLabel="Loading greeting" accessibilityState={{ busy: true }} style={styles.greetingSkeleton} />}
          </View>

            <View style={styles.flowieArea}>
              <View style={styles.flowieRow}>
                <Image
                  accessibilityLabel="Flowie, the LifeFlow assistant"
                  resizeMode="contain"
                  source={FLOWIE_MASCOTS[HOME_MASCOT_CYCLE[mascotIndex]]}
                  style={[styles.flowieImage, compactFlowie && styles.flowieImageCompact]}
                />
                <View style={styles.flowieRight}>
                  <View style={[styles.speechBubble, { height: bubbleHeight }]}>
                    <View style={styles.speechTail} />
                    <Text style={styles.flowieMessage}>{FLOWIE_MESSAGES[flowieMessageIndex]}</Text>
                    {/* Measure every candidate at the actual text width, reserving the tallest before rotation. */}
                    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bubbleMeasurements}>
                      {FLOWIE_MESSAGES.map(message => <Text key={message} style={styles.flowieMessage}
                        onTextLayout={({ nativeEvent }) => {
                          const height = nativeEvent.lines.reduce((total, line) => total + line.height, 0);
                          setBubbleMeasurement(previous => {
                            const current = previous.width === width && previous.fontScale === fontScale;
                            return current && previous.height >= height ? previous : { width, fontScale, height: Math.max(current ? previous.height : 0, height) };
                          });
                        }}>{message}</Text>)}
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={openFlowie}
                    style={({ pressed }) => [
                      styles.flowieButton,
                      pressed && styles.flowieButtonPressed,
                    ]}>
                    <Text style={styles.flowieButtonText}>Ask Flowie</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeading}>Latest Announcement</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="View all announcements" onPress={() => router.push('/announcements')} style={styles.viewAll}>
                <Text style={styles.viewAllText}>View All</Text><MaterialIcons name="chevron-right" size={18} color={COLORS.brand} />
              </Pressable>
            </View>

            {boardError?<Text style={styles.cardDescription}>{boardError}</Text>:null}
            {board.map((announcement,index)=>announcement==='red-cross'?(<View key="red-cross" style={styles.redCrossCard}>
              <View style={styles.redCrossIcon}>
                <MaterialIcons name="local-hospital" color={COLORS.brand} size={30} />
              </View>
              <View style={styles.redCrossContent}>
                {index===0?<Text style={styles.cardMeta}>PINNED</Text>:null}<Text style={styles.cardTitle}>Donate Through the Philippine Red Cross - Dagupan City Chapter</Text>
                <Text style={styles.cardDescription}>
                  Choose the Philippine Red Cross Dagupan City Chapter as your donation option.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openRedCrossOption}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}>
                  <Text style={styles.secondaryButtonText}>View Donation Option</Text>
                </Pressable>
              </View>
            </View>):(<View key={announcement.id} style={styles.adminAnnouncementCard}>
                <View style={styles.announcementImageArea}>
                  <Image
                    accessibilityLabel={`${announcement.title} illustration`}
                    resizeMode="contain"
                    source={announcementImageUrl(announcement.image_url) ? { uri: announcementImageUrl(announcement.image_url)! } : require('../../../assets/images/GoodMascot.png')}
                    style={announcementImageUrl(announcement.image_url) ? { width: '100%', height: 158 } : styles.announcementImage}
                  />
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{index===0?'PINNED':'ACTIVE BLOODLETTING'}</Text>
                  </View>
                </View>
                <View style={styles.announcementBody}>
                  <Text style={styles.cardTitle}>{announcement.title}</Text>
                  <Text style={styles.cardDescription} numberOfLines={3} ellipsizeMode="tail">{announcement.description}</Text>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" color={COLORS.brand} size={17} />
                    <Text style={styles.cardMeta}>{formatDonationDate(announcement.event_date ?? announcement.donation_date)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="location-on" color={COLORS.brand} size={17} />
                    <Text style={styles.cardMeta}>{announcement.location}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({pathname:'/announcement/[id]',params:{id:String(announcement.id)}})}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}>
                    <Text style={styles.primaryButtonText}>View Announcement</Text>
                  </Pressable>
                </View>
              </View>))}

          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeading}>Recent Activity</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="View all activity" onPress={() => router.push('/(tabs)/activity')} style={styles.viewAll}>
                <Text style={styles.viewAllText}>View All</Text><MaterialIcons name="chevron-right" size={18} color={COLORS.brand} />
              </Pressable>
            </View>
            {activityError ? <Text style={styles.cardDescription}>{activityError}</Text> : null}
            {recent ? <Pressable accessibilityRole="button" accessibilityLabel="View recent activity" onPress={() => router.push({ pathname: '/activity/[id]', params: { id: String(recent.id) } })} style={({ pressed }) => [styles.guideCard, pressed && styles.pressed]}>
              <Text style={styles.cardTitle} numberOfLines={2}>{recent.opportunity.title}</Text>
              <View style={styles.activityStatus}>
                <MaterialIcons name={recent.status === 'completed' ? 'check-circle-outline' : 'history'} size={20} color={COLORS.brand} />
                <Text style={styles.viewAllText}>{DONATION_STATUS[recent.status]}</Text>
              </View>
              <Text style={styles.cardMeta}>{recent.opportunity.event_date
                ? formatDonationDate(recent.opportunity.event_date)
                : 'Joined ' + formatJoinedDate(recent.joined_at)}</Text>
            </Pressable> : !activityError ? <View style={styles.guideCard}><Text style={styles.cardDescription}>No donation activity yet. Your latest activity will appear here.</Text></View> : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to Use LifeFlow</Text>
            <View style={styles.guideCard}>
              {GUIDE_STEPS.map(([title, description], index) => (
                <View key={title} style={styles.guideStep}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <Text style={styles.cardDescription}>{description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionHeading: { flex: 1, color: COLORS.text, fontSize: 20, fontWeight: '800' },
  viewAll: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  viewAllText: { color: COLORS.brand, fontSize: 14, fontWeight: '700' },
  activityStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fixedHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  header: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  brandTitle: { color: COLORS.brand, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
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
  pressed: { opacity: 0.7 },
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 25 },
  greetingBlock: { paddingHorizontal: 2 },
  greetingTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  greetingSkeleton: { width: 165, height: 29, borderRadius: 10, backgroundColor: '#EEE5DF' },
  flowieSection: { gap: 14 },
  flowieArea: { padding: 14, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#FFF0E8' },
  flowieRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flowieRight: { flex: 1, minWidth: 0, gap: 10 },
  flowieImage: { width: 105, height: 125 },
  flowieImageCompact: { width: 82, height: 98 },
  speechBubble: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    shadowColor: '#6E514C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  speechTail: {
    position: 'absolute',
    left: -9,
    top: '50%',
    marginTop: -8,
    width: 17,
    height: 17,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
  },
  flowieMessage: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  bubbleMeasurements: { position: 'absolute', left: 10, right: 10, top: 8, opacity: 0 },
  flowieButton: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
  flowieButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  flowieButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  adminAnnouncementCard: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E7A8A1',
    borderRadius: 22,
    backgroundColor: COLORS.white,
    shadowColor: '#8B3028',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 11,
    elevation: 4,
  },
  announcementImageArea: {
    height: 158,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: COLORS.softRed,
  },
  announcementImage: { width: 150, height: 150 },
  activeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
  },
  activeBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  announcementBody: { padding: 17 },
  cardContent: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  cardDescription: { marginTop: 5, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  cardMeta: { flex: 1, color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  primaryButton: {
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
  },
  primaryButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  redCrossCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  redCrossIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.softRed,
  },
  redCrossContent: { flex: 1 },
  secondaryButton: {
    minHeight: 43,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
  },
  secondaryButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  secondaryButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  guideCard: {
    gap: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  guideStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  stepNumber: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.softRed,
  },
  stepNumberText: { color: COLORS.brand, fontSize: 14, fontWeight: '800' },
});

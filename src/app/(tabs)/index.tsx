import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';
import { AnnouncementImage } from '@/components/announcement-image';
import { DidYouKnow } from '@/components/did-you-know';
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
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  brandPressed: PALETTE.primaryPressed,
  text: PALETTE.text,
  muted: PALETTE.neutral,
  border: PALETTE.border,
  softRed: PALETTE.selected,
  white: PALETTE.surface,
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

type HomeSection = 'profile' | 'board' | 'activity';
type SectionState = { loading: boolean; loaded: boolean; error: string };
const localGreeting = (date: Date) => date.getHours() >= 5 && date.getHours() < 12 ? 'Good morning'
  : date.getHours() >= 12 && date.getHours() < 18 ? 'Good afternoon' : 'Good evening';

function SectionError({ message, label, retry, loading }: { message: string; label: string; retry: () => void; loading: boolean }) {
  return <LoadError message={message} subject={label.replace('Retry ', '')} retryLabel={label} loading={loading} onRetry={retry} />;
}

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
  const compactFlowie = width < 340 || fontScale > 1.3;
  // ========================================
  // LIVE ANNOUNCEMENT BOARD
  // Reloads on focus and periodically; expiration removes only the board item.
  // The Red Cross system card stays present even when loading fails.
  // ========================================
  const { opportunities, donationHistory, profile, loadProfile } = useAuth();
  const [posts, setPosts] = useState<DonationOpportunity[]>([]);
  const [permanent, setPermanent] = useState<DonationOpportunity|null>(null);
  const [recent, setRecent] = useState<DonationParticipation | null>(null);
  const [sections, setSections] = useState<Record<HomeSection, SectionState>>({
    profile: { loading: true, loaded: false, error: '' },
    board: { loading: true, loaded: false, error: '' },
    activity: { loading: true, loaded: false, error: '' },
  });
  const requests = useRef<Partial<Record<HomeSection, Promise<unknown>>>>({});
  const retrySection = useRef<(section: HomeSection) => void>(() => {});
  const [clock, setClock] = useState(() => Date.now());
  const [greeting, setGreeting] = useState(() => localGreeting(new Date()));
  useFocusEffect(useCallback(() => {
    let active = true;
    const refreshing = new Set<HomeSection>();
    const run = <T,>(section: HomeSection, request: () => Promise<T>, apply: (value: T) => void) => {
      if (!active || refreshing.has(section)) return;
      refreshing.add(section);
      // Reuse in-flight work across a quick blur/refocus; only the active focus may apply it.
      const pending = requests.current[section] ?? Promise.resolve().then(request);
      requests.current[section] = pending;
      setSections(previous => ({ ...previous, [section]: { ...previous[section], loading: true } }));
      void pending.then(value => {
        if (active) {
          apply(value as T);
          setSections(previous => ({ ...previous, [section]: { loading: false, loaded: true, error: '' } }));
        }
      }).catch(error => {
        if (active) setSections(previous => ({ ...previous, [section]: { ...previous[section], loading: false, error: errorMessage(error) } }));
      }).finally(() => {
        refreshing.delete(section);
        if (requests.current[section] === pending) delete requests.current[section];
      });
    };
    const load = (section?: HomeSection) => {
      if (!section || section === 'profile') run('profile', loadProfile, () => {});
      if (!section || section === 'board') run('board', opportunities, result => { setPosts(result.data); setPermanent(result.permanent_post ?? null); setClock(Date.now()); });
      if (!section || section === 'activity') run('activity', () => donationHistory(1), result => setRecent(result.data[0] ?? null));
    };
    retrySection.current = load;
    load();
    const refresh = setInterval(() => load(), 30000);
    let greetingTimer: ReturnType<typeof setTimeout>;
    const updateGreeting = () => {
      if (!active) return;
      const now = new Date();
      setGreeting(localGreeting(now));
      // Device-local calendar boundaries also handle midnight and daylight-saving changes.
      const next = new Date(now);
      const hour = now.getHours();
      next.setHours(hour < 5 ? 5 : hour < 12 ? 12 : hour < 18 ? 18 : 29, 0, 0, 0);
      clearTimeout(greetingTimer);
      greetingTimer = setTimeout(updateGreeting, Math.max(1, next.getTime() - now.getTime()));
    };
    updateGreeting();
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active' && active) { updateGreeting(); setClock(Date.now()); load(); }
    });
    return () => {
      active = false; retrySection.current = () => {};
      clearInterval(refresh); clearTimeout(greetingTimer); foreground.remove();
    };
  }, [opportunities, donationHistory, loadProfile]));
  // Expire/publish board cards at their real boundary, without a one-second render loop.
  useEffect(() => {
    const next = posts.flatMap(post => [Date.parse(post.published_at ?? ''), Date.parse(post.expires_at ?? '')])
      .filter(time => Number.isFinite(time) && time > clock).sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(1, next - Date.now())));
    return () => clearTimeout(timer);
  }, [posts, clock]);
  const board = boardItems(posts, clock, permanent, true);
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
          <View style={styles.flowieSection}>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingTitle}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
            {sections.profile.error ? <SectionError message={sections.profile.error} label="Retry profile"
              loading={sections.profile.loading} retry={() => retrySection.current('profile')} /> : null}
          </View>

            <View style={styles.flowieArea}>
              <View style={styles.flowieRow}>
                <Image
                  fadeDuration={0}
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
                    accessibilityLabel="Ask Flowie"
                    onPress={openFlowie}
                    style={({ pressed }) => [
                      styles.flowieButton,
                      pressed && styles.flowieButtonPressed,
                    ]}>
                    <Text style={styles.flowieButtonText}>Ask Flowie</Text>
                    <MaterialIcons name="chevron-right" size={22} color={COLORS.white} accessible={false} />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeading}>Latest Announcement</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="View all announcements" onPress={() => router.push('/announcements')} style={styles.viewAll}>
                <Text style={styles.viewAllText}>View All</Text><MaterialIcons name="chevron-right" size={22} color={COLORS.brand} accessible={false} />
              </Pressable>
            </View>

            {sections.board.error ? <SectionError message={sections.board.error} label="Retry announcements"
              loading={sections.board.loading} retry={() => retrySection.current('board')} /> : null}
            {!sections.board.loaded && sections.board.loading ? <TabSkeleton variant="announcement" label="Loading announcements" /> : null}
            {board.map(announcement=>{
              const isPermanent=announcement.source_type==='red_cross_dagupan';
              return <Pressable key={isPermanent ? 'red-cross' : announcement.id} accessibilityRole="button" accessibilityLabel={`View details: ${announcement.title}`}
                onPress={() => router.push({ pathname: '/announcement/[id]', params: { id: isPermanent ? 'red-cross-dagupan' : String(announcement.id) } })}
                style={({ pressed }) => [styles.adminAnnouncementCard, pressed && styles.pressed]}>
                <AnnouncementImage uri={announcementImageUrl(announcement.image_url)} title={announcement.title} preview compact={isPermanent} />
                <View style={styles.announcementBody}>
                  <View style={[styles.announcementMeta,isPermanent && styles.permanentMeta]}>
                    <Text style={styles.activeBadgeText}>{isPermanent ? 'PERMANENT' : 'ACTIVE ANNOUNCEMENT'}</Text>
                    {isPermanent ? <MaterialIcons name="chevron-right" size={22} color={COLORS.brand} accessible={false} /> : null}
                    {!isPermanent && formatDonationDate(announcement.event_date ?? announcement.donation_date, '') ?
                      <Text style={styles.cardMeta}>{formatDonationDate(announcement.event_date ?? announcement.donation_date, '')}</Text> : null}
                  </View>
                  <Text style={styles.cardTitle}>{announcement.title}</Text>
                  {(isPermanent ? announcement.summary : announcement.description)?.trim() ? <Text style={styles.cardDescription} numberOfLines={2} ellipsizeMode="tail">{isPermanent ? announcement.summary : announcement.description}</Text> : null}
                  {!isPermanent ? <View style={styles.viewDetails}>
                    <Text style={styles.viewAllText}>View Details</Text>
                    <MaterialIcons name="chevron-right" size={22} color={COLORS.brand} accessible={false} />
                  </View> : null}
                </View>
              </Pressable>;
            })}
            {sections.board.loaded && !board.some(item=>item.source_type!=='red_cross_dagupan') ? <Text style={styles.cardDescription}>No active announcements right now. Check back for upcoming donation events.</Text> : null}

          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeading}>Recent Activity</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="View all activity" onPress={() => router.push('/(tabs)/activity')} style={styles.viewAll}>
                <Text style={styles.viewAllText}>View All</Text><MaterialIcons name="chevron-right" size={22} color={COLORS.brand} accessible={false} />
              </Pressable>
            </View>
            {sections.activity.error ? <SectionError message={sections.activity.error} label="Retry activity"
              loading={sections.activity.loading} retry={() => retrySection.current('activity')} /> : null}
            {!sections.activity.loaded && sections.activity.loading ? <TabSkeleton variant="activity" label="Loading recent activity" /> : null}
            {recent ? <Pressable accessibilityRole="button" accessibilityLabel="View recent activity" onPress={() => router.push({ pathname: '/activity/[id]', params: { id: String(recent.id) } })} style={({ pressed }) => [styles.guideCard, pressed && styles.pressed]}>
              <Text style={styles.cardTitle} numberOfLines={2}>{recent.opportunity.title}</Text>
              <View style={styles.activityStatus}>
                <MaterialIcons name={recent.status === 'completed' ? 'check-circle-outline' : 'history'} size={20} color={COLORS.brand} />
                <Text style={styles.viewAllText}>{DONATION_STATUS[recent.status]}</Text>
              </View>
              <Text style={styles.cardMeta}>{recent.opportunity.event_date
                ? formatDonationDate(recent.opportunity.event_date)
                : 'Joined ' + formatJoinedDate(recent.joined_at)}</Text>
            </Pressable> : sections.activity.loaded && !sections.activity.error && !sections.activity.loading ? <EmptyState icon="event-note" title="No donation activities yet" description="Your latest donation activity will appear here." /> : null}
          </View>

          <DidYouKnow />

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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionHeading: { flex: 1, color: COLORS.text, fontSize: 20, fontWeight: '800' },
  viewAll: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4, flexShrink: 1 },
  viewAllText: { color: COLORS.brand, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  errorCard: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  errorText: { color: PALETTE.neutralText, fontSize: 14, lineHeight: 21 },
  activityStatus: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fixedHeader: {
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
  brandTitle: { color: PALETTE.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
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
  greetingSkeleton: { width: 165, height: 29, borderRadius: 10, backgroundColor: PALETTE.border },
  flowieSection: { gap: 14 },
  flowieArea: { padding: 14, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: PALETTE.selected },
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
    shadowColor: PALETTE.text,
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
    flexDirection: 'row',
    gap: 6,
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
    flexShrink: 1,
  },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  adminAnnouncementCard: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: PALETTE.border,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    shadowColor: PALETTE.primaryPressed,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 11,
    elevation: 4,
  },
  announcementMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  permanentMeta: { justifyContent: 'space-between' },
  activeBadgeText: { color: COLORS.brand, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  announcementBody: { padding: 14, gap: 6 },
  viewDetails: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, minHeight: 28 },
  cardContent: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  cardDescription: { marginTop: 5, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  cardMeta: { flex: 1, color: COLORS.muted, fontSize: 13, fontWeight: '600' },
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

import { HomeDonationReminder } from '@/components/home-donation-reminder';
import { FLOWIE_MASCOTS, HOME_MASCOT_CYCLE } from '@/constants/flowie-mascots';
import { NotificationBell } from '@/components/notification-bell';
import {useAuth} from '@/contexts/auth-context';
import {boardItems,type DonationOpportunity} from '@/services/donations';
import {errorMessage} from '@/services/api';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

const flowieMessages = (firstName: string) => [
  `Hi ${firstName}! I'm here to help with your blood donation journey.`,
  "Need help checking if you're ready to donate? Ask me anytime!",
  'A healthy donor can make a life-saving difference.',
  "Have questions about blood types or donation preparation? I'm here!",
  "Don't forget—you can update your status through the Evaluation Form inside Flowie.",
] as const;

const GUIDE_STEPS = [
  ['Check Your Status', 'Complete the eligibility evaluation in the Status tab.'],
  ['Join Activities', 'View available blood donation activities.'],
  ['Earn Blood Points', 'Verified donations can earn points and rewards.'],
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [flowieMessageIndex, setFlowieMessageIndex] = useState(0);
  const stackFlowie = width < 370;
  // ========================================
  // LIVE ANNOUNCEMENT BOARD
  // Reloads on focus and periodically; expiration removes only the board item.
  // The Red Cross system card stays present even when loading fails.
  // ========================================
  const {opportunities, profile}=useAuth();const [posts,setPosts]=useState<DonationOpportunity[]>([]);const [boardError,setBoardError]=useState('');const [clock,setClock]=useState(() => Date.now());
  useFocusEffect(useCallback(()=>{let active=true;const load=()=>opportunities().then(r=>{if(active){setPosts(r.data);setBoardError('');}}).catch(e=>{if(active)setBoardError(errorMessage(e));});void load();const refresh=setInterval(()=>void load(),30000);const tick=setInterval(()=>setClock(Date.now()),1000);return()=>{active=false;clearInterval(refresh);clearInterval(tick);};},[opportunities]));
  const board=boardItems(posts,clock);
  const firstName = profile?.first_name?.trim() || 'Donor';
  const messages = flowieMessages(firstName);
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
      setFlowieMessageIndex((currentIndex) => (currentIndex + 1) % flowieMessages('').length);
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingTitle}>Hello, {firstName}</Text>
          </View>

          <View style={styles.flowieSection}>
            <Pressable
              accessibilityLabel="Open Flowie assistant"
              accessibilityRole="button"
              onPress={openFlowie}
              style={({ pressed }) => [styles.flowieArea, pressed && styles.flowieAreaPressed]}>
              <View style={[styles.flowieRow, stackFlowie && styles.flowieRowStacked]}>
                <Image
                  accessibilityLabel="Flowie, the LifeFlow assistant"
                  resizeMode="contain"
                  source={FLOWIE_MASCOTS[HOME_MASCOT_CYCLE[mascotIndex]]}
                  style={styles.flowieImage}
                />
                <View style={[styles.speechBubble, stackFlowie && styles.speechBubbleStacked]}>
                  <View style={[styles.speechTail, stackFlowie && styles.speechTailStacked]} />
                  <Text style={styles.flowieName}>Flowie</Text>
                  <Text style={styles.flowieMessage}>{messages[flowieMessageIndex]}</Text>
                </View>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openFlowie}
              style={({ pressed }) => [
                styles.flowieButton,
                pressed && styles.flowieButtonPressed,
              ]}>
              <Text style={styles.flowieButtonText}>Chat with Flowie</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Donation Opportunities</Text>

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
                    source={require('../../../assets/images/GoodMascot.png')}
                    style={styles.announcementImage}
                  />
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{index===0?'PINNED':'ACTIVE BLOODLETTING'}</Text>
                  </View>
                </View>
                <View style={styles.announcementBody}>
                  <Text style={styles.cardTitle}>{announcement.title}</Text>
                  <Text style={styles.cardDescription}>{announcement.description}</Text>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" color={COLORS.brand} size={17} />
                    <Text style={styles.cardMeta}>{announcement.event_date}</Text>
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
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
  greetingTitle: { color: COLORS.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  flowieSection: { gap: 14 },
  flowieArea: { paddingHorizontal: 2, borderRadius: 20 },
  flowieAreaPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  flowieRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flowieRowStacked: { flexDirection: 'column', gap: 0 },
  flowieImage: { width: 145, height: 145 },
  speechBubble: {
    position: 'relative',
    flex: 1,
    padding: 17,
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
  speechBubbleStacked: { width: '100%', flex: 0 },
  speechTail: {
    position: 'absolute',
    left: -9,
    top: 48,
    width: 17,
    height: 17,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
  },
  speechTailStacked: { left: 34, top: -9, transform: [{ rotate: '135deg' }] },
  flowieName: { color: COLORS.brand, fontSize: 18, fontWeight: '800' },
  flowieMessage: { marginTop: 5, color: COLORS.text, fontSize: 14, lineHeight: 21 },
  flowieButton: {
    width: '82%',
    maxWidth: 320,
    minHeight: 50,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
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

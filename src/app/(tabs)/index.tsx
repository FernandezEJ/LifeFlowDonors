import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const QUICK_ACTIONS = ['Can I donate?', 'Check eligibility', 'Blood type info'] as const;

// TODO: Announcements will later come from the Laravel API and admin panel.
const ANNOUNCEMENTS = [
  {
    title: 'Blood Donation Drive',
    description: 'Join our upcoming community blood donation activity.',
    meta: 'September 12, 2026',
    icon: 'campaign',
  },
  {
    title: 'Donor Reminder',
    description: 'Stay healthy, hydrated, and well-rested before donating.',
    meta: 'Donor wellness tip',
    icon: 'favorite',
  },
] as const;

const GUIDE_STEPS = [
  ['Check Your Status', 'Complete the eligibility evaluation in the Status tab.'],
  ['Join Activities', 'View available blood donation activities.'],
  ['Earn Blood Points', 'Verified donations can earn points and rewards.'],
] as const;

export default function HomeScreen() {
  const router = useRouter();

  // TODO: Flowie AI will later connect to the AI service through the Laravel backend.
  const handleFlowieAction = () => undefined;

  const openNotifications = () => {
    // TODO: Notification data will later come from the backend or Firebase.
    router.push('/notifications');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.brandTitle}>LifeFlow</Text>
              {/* TODO: Personalize this greeting after authenticated user data is available. */}
              <Text style={styles.greeting}>Ready to make a difference today?</Text>
            </View>
            <Pressable
              accessibilityLabel="Open notifications"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openNotifications}
              style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
              <MaterialIcons name="notifications-none" color={COLORS.text} size={25} />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>

          <View style={styles.flowieCard}>
            <View style={styles.flowieIntro}>
              <View style={styles.flowieCopy}>
                <Text style={styles.eyebrow}>YOUR DONATION COMPANION</Text>
                <Text style={styles.flowieTitle}>Ask Flowie</Text>
                <Text style={styles.flowieSubtitle}>Your blood donation assistant</Text>
              </View>
              <Image
                accessibilityLabel="Flowie, the LifeFlow assistant"
                resizeMode="contain"
                source={require('../../../assets/images/WelcomeLogo.png')}
                style={styles.flowieImage}
              />
            </View>
            <Text style={styles.flowieDescription}>
              Ask questions about blood donation, eligibility, blood types, and how LifeFlow works.
            </Text>
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  accessibilityRole="button"
                  key={action}
                  onPress={handleFlowieAction}
                  style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}>
                  <Text style={styles.quickActionText}>{action}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleFlowieAction}
              style={({ pressed }) => [styles.flowieButton, pressed && styles.flowieButtonPressed]}>
              <MaterialIcons name="auto-awesome" color={COLORS.white} size={19} />
              <Text style={styles.flowieButtonText}>Ask Flowie</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Announcements</Text>
            {ANNOUNCEMENTS.map((item) => (
              <View key={item.title} style={styles.announcementCard}>
                <View style={styles.announcementIcon}>
                  <MaterialIcons name={item.icon} color={COLORS.brand} size={22} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDescription}>{item.description}</Text>
                  <Text style={styles.cardMeta}>{item.meta}</Text>
                </View>
              </View>
            ))}
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 110 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerText: { flex: 1 },
  brandTitle: { color: COLORS.brand, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  greeting: { marginTop: 3, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  bellButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  pressed: { opacity: 0.7 },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  flowieCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#F2D5D0',
    borderRadius: 24,
    backgroundColor: COLORS.white,
    shadowColor: '#7D3E36',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  flowieIntro: { minHeight: 126, flexDirection: 'row', alignItems: 'center' },
  flowieCopy: { flex: 1, paddingRight: 8 },
  eyebrow: { color: COLORS.brand, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  flowieTitle: { marginTop: 5, color: COLORS.text, fontSize: 27, fontWeight: '800' },
  flowieSubtitle: { marginTop: 4, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  flowieImage: { width: 126, height: 126 },
  flowieDescription: { marginTop: 12, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  quickAction: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#F0CAC5',
    borderRadius: 14,
    backgroundColor: '#FFF8F6',
  },
  quickActionPressed: { backgroundColor: COLORS.softRed },
  quickActionText: { color: COLORS.brand, fontSize: 13, fontWeight: '700' },
  flowieButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 17,
    backgroundColor: COLORS.brand,
  },
  flowieButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  flowieButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  announcementCard: {
    flexDirection: 'row',
    gap: 13,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    shadowColor: '#6E514C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  announcementIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.softRed,
  },
  cardContent: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  cardDescription: { marginTop: 4, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  cardMeta: { marginTop: 8, color: COLORS.brand, fontSize: 12, fontWeight: '700' },
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

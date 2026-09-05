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
  white: '#FFFFFF',
  softGreen: '#E2F5E9',
  green: '#287A47',
  softRed: '#FDE8E8',
  softAmber: '#FFF1D6',
  amber: '#A76500',
};

type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'EVALUATION_REQUIRED';

type DonorStatus = {
  status: EligibilityStatus;
  age: number;
  weight: number;
  gender: string;
  bloodType: string;
  lastDonation: string;
  nextEligibility: string;
  reason?: string;
  advice?: string;
};

const MOCK_STATUS: DonorStatus = {
  status: 'ELIGIBLE',
  age: 21,
  weight: 62,
  gender: 'Male',
  bloodType: 'O+',
  lastDonation: 'June 10, 2026',
  nextEligibility: 'Based on next evaluation',
};

const STATUS_PRESENTATION: Record<
  EligibilityStatus,
  {
    title: string;
    description: string;
    icon: 'check-circle' | 'cancel' | 'pending';
    background: string;
    color: string;
  }
> = {
  ELIGIBLE: {
    title: 'You are eligible to donate!',
    description:
      'Based on your latest LifeFlow evaluation, you may proceed with donation planning.',
    icon: 'check-circle',
    background: COLORS.softGreen,
    color: COLORS.green,
  },
  NOT_ELIGIBLE: {
    title: 'You are temporarily not eligible to donate.',
    description: 'Review the result from your latest evaluation before planning another donation.',
    icon: 'cancel',
    background: COLORS.softRed,
    color: COLORS.brand,
  },
  EVALUATION_REQUIRED: {
    title: 'Evaluation required.',
    description: 'Complete the LifeFlow evaluation to update your current donation readiness.',
    icon: 'pending',
    background: COLORS.softAmber,
    color: COLORS.amber,
  },
};

const SUMMARY_ITEMS = [
  { label: 'Age', value: `${MOCK_STATUS.age} years old`, icon: 'cake' as const },
  { label: 'Weight', value: `${MOCK_STATUS.weight} kg`, icon: 'monitor-weight' as const },
  { label: 'Gender', value: MOCK_STATUS.gender, icon: 'person-outline' as const },
  { label: 'Blood Type', value: MOCK_STATUS.bloodType, icon: 'bloodtype' as const },
  { label: 'Last Donation', value: MOCK_STATUS.lastDonation, icon: 'event' as const },
  { label: 'Next Eligibility', value: MOCK_STATUS.nextEligibility, icon: 'update' as const },
];

export default function StatusScreen() {
  const router = useRouter();
  const presentation = STATUS_PRESENTATION[MOCK_STATUS.status];
  const showReason = MOCK_STATUS.status === 'NOT_ELIGIBLE';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Status</Text>
          <Pressable
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
            <MaterialIcons name="notifications-none" color={COLORS.text} size={25} />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.statusCard, { backgroundColor: presentation.background }]}>
            <View style={styles.mascotArea}>
              <Image
                accessibilityLabel="Flowie, the LifeFlow assistant"
                resizeMode="contain"
                source={require('../../../assets/images/HappyMascot.png')}
                style={styles.statusMascot}
              />
              <View style={[styles.statusIcon, { backgroundColor: COLORS.white }]}>
                <MaterialIcons name={presentation.icon} color={presentation.color} size={22} />
              </View>
            </View>
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: presentation.color }]}>
                {presentation.title}
              </Text>
              <Text style={styles.statusDescription}>{presentation.description}</Text>
            </View>
          </View>

          {showReason ? (
            <View style={styles.adviceCard}>
              <Text style={styles.adviceHeading}>Reason</Text>
              <Text style={styles.adviceText}>
                {MOCK_STATUS.reason ?? 'Example reason from latest evaluation'}
              </Text>
              <Text style={styles.adviceHeading}>Advice</Text>
              <Text style={styles.adviceText}>
                {MOCK_STATUS.advice ?? 'Complete another evaluation when your condition changes.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Donor Summary</Text>
            <View style={styles.summaryGrid}>
              {SUMMARY_ITEMS.map((item) => (
                <View key={item.label} style={styles.summaryItem}>
                  <View style={styles.summaryIcon}>
                    <MaterialIcons name={item.icon} color={COLORS.brand} size={21} />
                  </View>
                  <View style={styles.summaryContent}>
                    <Text style={styles.summaryLabel}>{item.label}</Text>
                    <Text style={styles.summaryValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.disclaimerCard}>
            <MaterialIcons name="info-outline" color={COLORS.brand} size={22} />
            <Text style={styles.disclaimerText}>
              LifeFlow status is a planning guide based on your evaluation. It is not final medical
              clearance to donate.
            </Text>
          </View>

          <View style={styles.updateSection}>
            <Text style={styles.updateHelper}>
              Open Flowie to access the Evaluation Form and update your donation status.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/flowie')}
            style={({ pressed }) => [styles.updateButton, pressed && styles.updateButtonPressed]}>
            <MaterialIcons name="chat-bubble-outline" color={COLORS.white} size={21} />
            <Text style={styles.updateButtonText}>Update Status with Flowie</Text>
          </Pressable>

          {/* TODO: Laravel will calculate and store the next eligible donation date from the
              project's approved donation rules and verified donation history. */}
        </View>
      </ScrollView>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  statusCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 22,
  },
  mascotArea: {
    width: 126,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusMascot: { width: 118, height: 118 },
  statusIcon: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    shadowColor: '#4C403E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusContent: { width: '100%', alignItems: 'center' },
  statusTitle: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 25,
    textAlign: 'center',
  },
  statusDescription: {
    maxWidth: 430,
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  adviceCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 19,
    backgroundColor: COLORS.softRed,
  },
  adviceHeading: { marginTop: 5, color: COLORS.brand, fontSize: 12, fontWeight: '800' },
  adviceText: { marginTop: 4, marginBottom: 7, color: COLORS.text, fontSize: 14, lineHeight: 20 },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryItem: {
    minWidth: 150,
    minHeight: 82,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.white,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  summaryContent: { flex: 1 },
  summaryLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  summaryValue: { marginTop: 3, color: COLORS.text, fontSize: 13, fontWeight: '800', lineHeight: 17 },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 15,
    borderRadius: 17,
    backgroundColor: COLORS.softRed,
  },
  disclaimerText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  updateSection: { marginBottom: -11 },
  updateHelper: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  updateButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: COLORS.brand,
  },
  updateButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.99 }],
  },
  updateButtonText: { color: COLORS.white, fontSize: 14, fontWeight: '800', textAlign: 'center' },
});

import { TabSkeleton } from '@/components/tab-skeleton';
import { NotificationBell } from '@/components/notification-bell';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { useEligibilityCooldown, formatEligibilityWait } from '@/hooks/use-eligibility-cooldown';
import { SCREENING_NOTICE, formatDonationRestDate, type EligibilityAssessment } from '@/services/eligibility';
import { type ImageSourcePropType, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'EVALUATION_REQUIRED' | 'NEEDS_SCREENING';

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
    title: 'Ready to proceed',
    description:
      'Based on your latest self-assessment, you may proceed to the donation facility for final screening.',
    icon: 'check-circle',
    background: COLORS.softGreen,
    color: COLORS.green,
  },
  NOT_ELIGIBLE: {
    title: 'Not Eligible for Now',
    description: 'Based on your latest self-assessment, one or more factors suggest that you should wait before donating.',
    icon: 'cancel',
    background: COLORS.softRed,
    color: COLORS.brand,
  },
  NEEDS_SCREENING: {
    title: 'Not Eligible for Now',
    description: 'This saved assessment used an earlier questionnaire. It has not been re-evaluated. Please confirm with the donation facility.',
    icon: 'pending', background: COLORS.softAmber, color: COLORS.amber,
  },
  EVALUATION_REQUIRED: {
    title: 'Pre-screening unavailable',
    description: 'Complete the Donation Readiness Self-Assessment to view your latest status.',
    icon: 'pending',
    background: COLORS.softAmber,
    color: COLORS.amber,
  },
};

// ========================================
// STATUS MASCOT STATE
// Donation rest takes precedence; otherwise use the saved assessment result.
// ========================================
const STATUS_MASCOTS: { happy: ImageSourcePropType; rest: ImageSourcePropType; concerned: ImageSourcePropType | null } = {
  happy: require('../../../assets/images/HappyMascot.png'),
  rest: require('../../../assets/images/RestMascot.png'),
  concerned: require('../../../assets/images/SadMascot.png'),
};

// Display saved values only. Missing legacy fields never become invented answers.
const LEGACY_ANSWER_LABELS: readonly { key: string; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'sleepHours', label: 'Sleep last night' },
  { key: 'currentSymptoms', label: 'Current symptoms' },
  { key: 'donatedWithinThreeMonths', label: 'Donated within the last 3 months' },
  { key: 'feelsWell', label: 'Feel well enough today' },
  { key: 'currentlyPregnant', label: 'Currently pregnant' },
  { key: 'takingAntibioticsForActiveInfection', label: 'Taking antibiotics for an active infection' },
  { key: 'stillRecoveringFromProcedure', label: 'Still recovering from surgery / procedure / hospitalization' },
  { key: 'activeOrRecoveringInfection', label: 'Active infection / recovering from one' },
  { key: 'weakDizzyOrUnusuallyTired', label: 'Weak, dizzy, unusually tired, or physically unwell' },
];
const ANSWER_LABELS = [
  { key: 'weightAtLeast50Kg', label: 'Do you weigh at least 50 kg?' },
  { key: 'sleptAtLeastFiveHours', label: 'Have you had at least 5 hours of sleep before your planned donation?' },
  { key: 'eatenProperMeal', label: 'Have you eaten a proper meal before your planned donation?' },
  { key: 'avoidedAlcoholFor24Hours', label: 'Have you avoided drinking alcohol within the last 24 hours?' },
  { key: 'threeMonthsSinceLastDonation', label: 'Have at least 3 months passed since your last completed blood donation?' },
  { key: 'recentFeverInfectionOrIllness', label: 'Have you had a fever, infection, or illness recently?' },
  { key: 'unusualBleedingWeaknessOrDizziness', label: 'Have you recently experienced unusual bleeding, severe weakness, or dizziness?' },
  { key: 'recentSurgeryOrMajorProcedure', label: 'Have you recently undergone surgery or a major medical or dental procedure?' },
  { key: 'medicationAffectingDonation', label: 'Are you currently taking medication that may affect blood donation?' },
  { key: 'conditionOrTreatmentRequiringWait', label: 'Have you had any recent condition or treatment that a blood donation facility previously told you requires waiting before donating again?' },
];
function answerLabels(assessment: EligibilityAssessment | null) {
  return assessment && 'weightAtLeast50Kg' in assessment.answers ? ANSWER_LABELS : LEGACY_ANSWER_LABELS;
}
function displayAnswer(key: string, value: unknown): string {
  if (key === 'weight' || key === 'sleepHours') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not recorded';
    return key === 'weight' ? value + ' kg' : value + (value === 1 ? ' hour' : ' hours');
  }
  if (value === 'YES') return 'Yes';
  if (value === 'NO') return 'No';
  if (key === 'currentlyPregnant' && value === 'NOT_APPLICABLE') return 'Not applicable';
  return 'Not recorded';
}
function displayServerDate(value: string | null | undefined, empty: string): string {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not recorded';
}

export default function StatusScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  // ========================================
  // LATEST SAVED PRE-SCREENING
  // Cancels stale screen updates on blur and never substitutes a mock result.
  // ========================================
  const cooldown = useEligibilityCooldown();
  const { loading, error } = cooldown;
  const assessment = cooldown.state?.assessment ?? null;
  const state: EligibilityStatus = !assessment ? 'EVALUATION_REQUIRED'
    : assessment.result === 'eligible' ? 'ELIGIBLE'
    : assessment.result === 'needs_further_screening' ? 'NEEDS_SCREENING' : 'NOT_ELIGIBLE';
  const onRest = cooldown.state?.is_on_donation_cooldown === true;
  const presentation = onRest ? {
    title: 'Donation Rest Period', description: 'You recently completed a blood donation.',
    icon: 'pending' as const, background: COLORS.softAmber, color: COLORS.amber,
  } : STATUS_PRESENTATION[state];
  const showReason = !onRest && !!assessment?.reasons.length;
  const mascot = onRest ? STATUS_MASCOTS.rest
    : (!loading || !!cooldown.state) && !error && (state === 'NOT_ELIGIBLE' || state === 'NEEDS_SCREENING')
      ? STATUS_MASCOTS.concerned ?? STATUS_MASCOTS.happy : STATUS_MASCOTS.happy;
  // ========================================
  // DONOR SUMMARY
  // Server timestamps precede all ten saved answers. No eligibility calculation
  // or device-clock authorization is performed by this presentation layer.
  // ========================================
  const summaryItems = [
    { label: 'Assessed', value: displayServerDate(assessment?.assessed_at, 'Not assessed'), icon: 'event' as const, wide: true },
    { label: 'Next self-assessment available', value: assessment
      ? displayServerDate(cooldown.state?.next_allowed_at, 'Not recorded') : 'Not available', icon: 'update' as const, wide: true },
    ...answerLabels(assessment).map(({ key, label }, index) => ({
      label: (index + 1) + '. ' + label,
      value: displayAnswer(key, assessment?.answers?.[key]),
      icon: key === 'weight' ? 'monitor-weight' as const : 'fact-check' as const,
      wide: label.length > 35,
    })),
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Status</Text>
          {/* Shared backend unread count refreshes on focus. */}<NotificationBell />
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loading && !cooldown.state ? <TabSkeleton variant="summary" /> : <>
          <View style={[styles.statusCard, { backgroundColor: presentation.background }]}>
            <View style={styles.mascotArea}>
              <Image
                accessibilityLabel="Flowie, the LifeFlow assistant"
                resizeMode="contain"
                source={mascot}
                style={styles.statusMascot}
              />
              <View style={[styles.statusIcon, { backgroundColor: COLORS.white }]}>
                <MaterialIcons name={presentation.icon} color={presentation.color} size={22} />
              </View>
            </View>
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: presentation.color }]}>
                {onRest ? presentation.title : loading && !cooldown.state ? 'Loading pre-screening…' : error ? 'Pre-screening unavailable' : presentation.title}
              </Text>
              <Text style={styles.statusDescription}>{onRest ? presentation.description : error || presentation.description}</Text>
              {onRest ? <>
                <Text style={styles.statusDescription}>You can donate again on:</Text>
                <Text style={[styles.statusTitle, { color: presentation.color }]}>{formatDonationRestDate(cooldown.state?.next_eligible_donation_at)}</Text>
                <Text style={styles.statusDescription}>Your 3-month donation rest period helps ensure enough recovery time before your next donation.</Text>
              </> : null}
            </View>
          </View>

          {showReason ? (
            <View style={styles.adviceCard}>
              <Text style={styles.adviceHeading}>Reason</Text>
              <Text style={styles.adviceText}>
                {assessment?.reasons.join('\n\n')}
              </Text>
              <Text style={styles.adviceHeading}>Advice</Text>
              <Text style={styles.adviceText}>
                {SCREENING_NOTICE}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Donor Summary</Text>
            <View style={styles.summaryGrid}>
              {summaryItems.map((item) => (
                <View key={item.label} style={[styles.summaryItem, item.wide && styles.summaryWide]}>
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
              {SCREENING_NOTICE}
            </Text>
          </View>

          {/* One compact countdown accompanies the action; exact dates stay in Donor Summary. */}
          <View style={styles.updateSection}>
          <Pressable
            accessibilityRole="button"
            disabled={!cooldown.canSubmit}
            accessibilityState={{ disabled: !cooldown.canSubmit }}
            onPress={() => { if (cooldown.canSubmit) router.push(assessment ? '/flowie' : '/evaluation'); }}
            style={({ pressed }) => [styles.updateButton, !cooldown.canSubmit && { opacity: 0.5 }, pressed && styles.updateButtonPressed]}>
            <MaterialIcons name="chat-bubble-outline" color={COLORS.white} size={21} />
            <Text style={styles.updateButtonText}>{assessment ? 'Update Status with Flowie' : 'Start Assessment'}</Text>
          </Pressable>

          {assessment && cooldown.state?.cooldown_active ? <Text style={styles.updateHelper}>
            {formatEligibilityWait(cooldown.remaining).replace('Evaluate again in ', 'Available again in ')}
          </Text> : null}
          </View>
          {/* Refresh errors keep the action locked until server availability is known. */}
          {error ? <Pressable accessibilityRole="button" onPress={() => void cooldown.reload()} style={styles.updateButton}>
            <Text style={styles.updateButtonText}>Retry availability check</Text>
          </Pressable> : null}
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: 'transparent' },
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
    minWidth: 0,
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
  summaryWide: { flexBasis: '100%' },
  summaryIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  summaryContent: { flex: 1 },
  summaryLabel: { color: COLORS.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
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
  updateSection: { gap: 8 },
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

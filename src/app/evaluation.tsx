import { TabSkeleton } from '@/components/tab-skeleton';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { errorMessage } from '@/services/api';
import { useEligibilityCooldown } from '@/hooks/use-eligibility-cooldown';
import { EligibilityCooldownError, SCREENING_NOTICE, type EligibilityAnswers, type EligibilityAssessment, type EligibilityResult } from '@/services/eligibility';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ========================================
// SELF-ASSESSMENT QUESTION FLOW
// Answers stay in this screen until review. Only Laravel evaluates them.
// ========================================
type Question = { key: keyof EligibilityAnswers; text: string };
export const QUESTIONS: readonly Question[] = [
  { key: 'weightAtLeast50Kg', text: 'Do you weigh at least 50 kg?' },
  { key: 'sleptAtLeastFiveHours', text: 'Have you had at least 5 hours of sleep before your planned donation?' },
  { key: 'eatenProperMeal', text: 'Have you eaten a proper meal before your planned donation?' },
  { key: 'avoidedAlcoholFor24Hours', text: 'Have you avoided drinking alcohol within the last 24 hours?' },
  { key: 'threeMonthsSinceLastDonation', text: 'Have at least 3 months passed since your last completed blood donation?' },
  { key: 'recentFeverInfectionOrIllness', text: 'Have you had a fever, infection, or illness recently?' },
  { key: 'unusualBleedingWeaknessOrDizziness', text: 'Have you recently experienced unusual bleeding, severe weakness, or dizziness?' },
  { key: 'recentSurgeryOrMajorProcedure', text: 'Have you recently undergone surgery or a major medical or dental procedure?' },
  { key: 'medicationAffectingDonation', text: 'Are you currently taking medication that may affect blood donation?' },
  { key: 'conditionOrTreatmentRequiringWait', text: 'Have you had any recent condition or treatment that a blood donation facility previously told you requires waiting before donating again?' },
];
type Draft = Partial<EligibilityAnswers>;
export function validAnswer(_question: Question, value = ''): boolean {
  return value === 'YES' || value === 'NO';
}
function answerLabel(value?: string) {
  return value === 'YES' ? 'Yes' : value === 'NO' ? 'No' : value === 'NOT_APPLICABLE' ? 'Not applicable' : value || 'Not answered';
}
const RESULTS: Record<EligibilityResult, { title: string; copy: string; color: string }> = {
  eligible: { title: 'Ready to proceed', copy: 'Based on your answers, you may proceed with the donation process.', color: '#287A47' },
  not_eligible: { title: 'Not Eligible for Now', copy: 'One or more of your answers did not meet LifeFlow\'s current pre-screening criteria.', color: '#B52E2E' },
  // Preserve historical output without re-evaluating old answers.
  temporarily_ineligible: { title: 'Not Eligible for Now', copy: 'Based on your answers, one or more factors may mean you should wait before donating.', color: '#B52E2E' },
  needs_further_screening: { title: 'Not Eligible for Now', copy: 'This saved assessment used an earlier questionnaire. It has not been re-evaluated. Please confirm with the donation facility.', color: '#514644' },
};

// Shared accessible buttons keep event handlers outside render-time execution.
function AssessmentButton({ label, onPress, disabled = false, secondary = false, busy = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; busy?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

export default function EvaluationScreen() {
  const router = useRouter();
  const { submitAssessment } = useAuth();
  const cooldown = useEligibilityCooldown();
  const [step, setStep] = useState(-1); // -1 intro; 0..9 questions; 10 review.
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<EligibilityAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const blocked = loading || !cooldown.canSubmit;
  const latest = cooldown.state?.assessment;
  const result = saved && (!latest || saved.id >= latest.id) ? saved : latest;
  const showResult = !!result && (!!saved || (step === QUESTIONS.length && !conflict && !!cooldown.state?.cooldown_active));
  const showCooldown = !!cooldown.state?.cooldown_active && !showResult;
  const question = QUESTIONS[step];
  const go = (next: number) => {
    if (blocked) return;
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // ========================================
  // CONFIRMED SUBMISSION AND COOLDOWN RECOVERY
  // A lost response may already have committed. Refresh before allowing retry.
  // ========================================
  const submit = async () => {
    if (submitting.current || blocked || step !== QUESTIONS.length || !QUESTIONS.every(q => validAnswer(q, draft[q.key]))) return;
    submitting.current = true; setLoading(true); setError('');
    const answers = { ...draft } as EligibilityAnswers;
    try {
      setSaved(await submitAssessment(answers));
      await cooldown.reload();
    } catch (failure) {
      if (failure instanceof EligibilityCooldownError) {
        cooldown.accept(failure.state);
        setConflict(true);
      } else {
        setError(errorMessage(failure));
        await cooldown.reload();
      }
    } finally {
      submitting.current = false; setLoading(false);
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  };
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
          <MaterialIcons name="arrow-back" size={24} color="#372E2E" />
        </Pressable>
        <Text style={styles.headerTitle}>Self-Assessment</Text>
        <NotificationBell />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            {cooldown.loading && !cooldown.state && !saved ? <TabSkeleton /> : null}
            {cooldown.error ? <View style={styles.notice}>
              <Text accessibilityRole="alert" style={styles.body}>{cooldown.error}</Text>
              {<AssessmentButton label={'Retry availability check'} onPress={() => void cooldown.reload()} disabled={loading} busy={loading} />}
            </View> : null}
            {error && !showResult ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
            {showCooldown ? <View style={styles.notice}>
              <MaterialIcons name="schedule" size={28} color="#D93A3A" />
              <Text style={styles.subheading}>Self-Assessment Not Yet Available</Text>
              <Text style={styles.body}>You recently completed a self-assessment. You can complete another one after the current 24-hour assessment period ends.</Text>
              {cooldown.state?.next_allowed_at ? <Text style={styles.body}>Available again: {new Date(cooldown.state.next_allowed_at).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text> : null}
              <AssessmentButton label="Close" onPress={() => router.back()} />
            </View> : null}

            {/* PRE-SCREENING RESULT: display saved Laravel output, never a local decision. */}
            {showResult && result ? <>
              <View style={styles.complete}><MaterialIcons name="check-circle" size={22} color="#287A47" /><Text style={styles.subheading}>Assessment Complete</Text></View>
              <View style={styles.card} accessibilityLiveRegion="polite">
                <Text style={styles.eyebrow}>Your Pre-Screening Result</Text>
                <Text style={[styles.title, { color: RESULTS[result.result].color }]}>{RESULTS[result.result].title}</Text>
                <Text style={styles.body}>{RESULTS[result.result].copy}</Text>
                {result.reasons.map((reason, index) => <Text key={index} style={styles.reason}>{reason}</Text>)}
                <Text style={styles.body}>{SCREENING_NOTICE}</Text>
              </View>
              <View style={styles.notice}>
                <MaterialIcons name="info-outline" size={24} color="#766A68" />
                <Text style={styles.subheading}>Important Reminder</Text>
                <Text style={styles.body}>Recent tattoos or body piercings may require a waiting period before blood donation.</Text>
                <Text style={styles.body}>This self-assessment is only a pre-screening guide. Final eligibility will still be confirmed by the donation facility.</Text>
              </View>
              <AssessmentButton label="View Status" onPress={() => router.push('/(tabs)/status')} />
              <AssessmentButton label="Back to Flowie" onPress={() => router.push('/flowie')} secondary />
              {cooldown.canSubmit ? <AssessmentButton label={'Start a new assessment'} onPress={() => { setSaved(null); setConflict(false); setDraft({}); go(-1); }} busy={loading} /> : null}
            </> : cooldown.state?.cooldown_active ? null : step === -1 ? <View style={styles.card}>
              <Text style={styles.title}>Donation Readiness Self-Assessment</Text>
              <Text style={styles.body}>This quick self-assessment helps you check your current readiness before visiting a donation facility.</Text>
              <Text style={styles.body}>{SCREENING_NOTICE}</Text>
              <Text style={styles.body}>You can submit one assessment every 24 hours. Please review your answers carefully before submitting.</Text>
              {<AssessmentButton label={'Start Assessment'} onPress={() => go(0)} disabled={blocked} busy={loading} />}
            </View> : step < QUESTIONS.length ? <View style={styles.card}>
              <Text style={styles.eyebrow}>Question {step + 1} of 10</Text>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 10, now: step + 1 }}
                accessibilityLabel="Assessment progress" style={styles.progress}>
                <View style={[styles.progressFill, { width: (((step + 1) * 10) + '%') as `${number}%` }]} />
              </View>
              <Text style={styles.title}>{question.text}</Text>
              {(['YES', 'NO'] as const).map(value => (
                <Pressable key={value} accessibilityRole="radio" accessibilityLabel={answerLabel(value)}
                  accessibilityState={{ checked: draft[question.key] === value, disabled: blocked }} disabled={blocked}
                  onPress={() => { if (!blocked) setDraft(current => ({ ...current, [question.key]: value })); }}
                  style={[styles.option, draft[question.key] === value && styles.selected]}>
                  <Text style={[styles.body, draft[question.key] === value && styles.selectedText]}>{answerLabel(value)}</Text>
                </Pressable>
              ))}
              {<AssessmentButton label={'Next'} onPress={() => { if (validAnswer(question, draft[question.key])) go(step + 1); }} disabled={blocked || !validAnswer(question, draft[question.key])} busy={loading} />}
              {<AssessmentButton label={'Back'} onPress={() => go(step - 1)} disabled={blocked} secondary={true} busy={loading} />}
              <Text style={styles.hint}>{SCREENING_NOTICE}</Text>
            </View> : <View style={styles.card}>
              {/* REVIEW ANSWERS: question ten never submits automatically. */}
              <Text style={styles.title}>Review Answers</Text>
              <Text style={styles.body}>Please check all 10 answers. You can submit one assessment every 24 hours.</Text>
              {QUESTIONS.map((q, index) => <View key={q.key} style={styles.reviewRow}>
                <Text style={styles.subheading}>{index + 1}. {q.text}</Text>
                <Text style={styles.body}>{answerLabel(draft[q.key])}</Text>
              </View>)}
              {<AssessmentButton label={'Edit Answers'} onPress={() => go(0)} disabled={blocked} secondary={true} busy={loading} />}
              {<AssessmentButton label={loading ? 'Submitting Assessment...' : 'Submit Assessment'} onPress={() => void submit()} disabled={blocked} busy={loading} />}
              <Text style={styles.hint}>{SCREENING_NOTICE}</Text>
            </View>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </>;
}

const styles = StyleSheet.create({
  complete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0E2DC' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#372E2E', fontSize: 17, fontWeight: '800' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E2DC', borderRadius: 22, padding: 20, gap: 18 },
  notice: { backgroundColor: '#FDE8E8', borderRadius: 18, padding: 18, gap: 10 },
  title: { color: '#372E2E', fontSize: 25, lineHeight: 33, fontWeight: '800' },
  subheading: { color: '#372E2E', fontSize: 16, lineHeight: 23, fontWeight: '700' },
  eyebrow: { color: '#B52E2E', fontSize: 15, fontWeight: '800' },
  body: { color: '#514644', fontSize: 16, lineHeight: 24 },
  hint: { color: '#766A68', fontSize: 13, lineHeight: 20 },
  reason: { color: '#514644', fontSize: 16, lineHeight: 24, borderLeftWidth: 3, borderLeftColor: '#D93A3A', paddingLeft: 12 },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#F0E2DC' },
  progressFill: { height: 8, backgroundColor: '#D93A3A' },
  input: { minHeight: 56, borderWidth: 1, borderColor: '#D4C4BE', borderRadius: 14, padding: 14, fontSize: 20, color: '#372E2E' },
  option: { minHeight: 56, justifyContent: 'center', padding: 16, borderWidth: 1, borderColor: '#D4C4BE', borderRadius: 14 },
  selected: { backgroundColor: '#D93A3A', borderColor: '#D93A3A' }, selectedText: { color: '#FFFFFF' },
  button: { minHeight: 52, padding: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D93A3A' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  secondary: { backgroundColor: '#FFF9F2', borderWidth: 1, borderColor: '#D93A3A' }, secondaryText: { color: '#B52E2E' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  reviewRow: { gap: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F0E2DC' },
});

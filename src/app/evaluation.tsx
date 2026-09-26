import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { errorMessage } from '@/services/api';
import { useEligibilityCooldown, formatEligibilityWait } from '@/hooks/use-eligibility-cooldown';
import { EligibilityCooldownError, SCREENING_NOTICE, type EligibilityAnswers, type EligibilityAssessment, type EligibilityResult } from '@/services/eligibility';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ========================================
// SELF-ASSESSMENT QUESTION FLOW
// Answers stay in this screen until review. Only Laravel evaluates them.
// ========================================
type Question = { key: keyof EligibilityAnswers; text: string; numeric?: boolean; pregnancy?: boolean };
export const QUESTIONS: readonly Question[] = [
  { key: 'weight', text: 'What is your current weight in kilograms?', numeric: true },
  { key: 'sleepHours', text: 'How many hours did you sleep last night?', numeric: true },
  { key: 'currentSymptoms', text: 'Do you currently have fever, cough, colds, sore throat, or otherwise feel unwell?' },
  { key: 'donatedWithinThreeMonths', text: 'Have you donated blood within the last 3 months?' },
  { key: 'feelsWell', text: 'Do you feel well enough to donate today?' },
  { key: 'currentlyPregnant', text: 'Are you currently pregnant?', pregnancy: true },
  { key: 'takingAntibioticsForActiveInfection', text: 'Are you currently taking antibiotics for an active infection?' },
  { key: 'stillRecoveringFromProcedure', text: 'Are you still recovering from surgery, a medical procedure, or a recent hospitalization?' },
  { key: 'activeOrRecoveringInfection', text: 'Do you currently have an active infection or are you still recovering from one?' },
  { key: 'weakDizzyOrUnusuallyTired', text: 'Are you currently feeling weak, dizzy, unusually tired, or physically unwell today?' },
];
type Draft = Partial<Record<keyof EligibilityAnswers, string>>;
export function validAnswer(question: Question, value = ''): boolean {
  if (question.numeric) {
    const normalized = value.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return false;
    const number = Number(normalized);
    return Number.isFinite(number) && (question.key === 'weight' ? number > 0 : number >= 0 && number <= 24);
  }
  return value === 'YES' || value === 'NO' || (!!question.pregnancy && value === 'NOT_APPLICABLE');
}
function answerLabel(value?: string) {
  return value === 'YES' ? 'Yes' : value === 'NO' ? 'No' : value === 'NOT_APPLICABLE' ? 'Not applicable' : value || 'Not answered';
}
const RESULTS: Record<EligibilityResult, { title: string; copy: string; color: string }> = {
  eligible: { title: 'Ready to proceed', copy: 'Based on your answers, you may proceed to the donation facility for final screening.', color: '#287A47' },
  not_eligible: { title: 'Not ready to donate right now', copy: 'Based on your answers, one or more factors suggest that you should wait before donating.', color: '#B52E2E' },
  // Preserve historical output without re-evaluating old answers.
  temporarily_ineligible: { title: 'Not ready to donate right now', copy: 'Based on your answers, one or more factors may mean you should wait before donating.', color: '#B52E2E' },
  needs_further_screening: { title: 'Previous assessment: facility review advised', copy: 'This saved assessment used an earlier questionnaire. It has not been re-evaluated. Please confirm with the donation facility.', color: '#514644' },
};
const PREPARATION = ['Get enough rest', 'Eat a proper meal', 'Stay hydrated', 'Prepare ID / required documents', 'Check donation location and time'];

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
  const submitting = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const blocked = loading || !cooldown.canSubmit;
  const latest = cooldown.state?.assessment;
  const result = saved && (!latest || saved.id >= latest.id) ? saved : latest;
  const showResult = !!result && (!!saved || !!cooldown.state?.cooldown_active);
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
    const answers = { ...draft, weight: Number(draft.weight!.replace(',', '.')), sleepHours: Number(draft.sleepHours!.replace(',', '.')) } as EligibilityAnswers;
    try {
      setSaved(await submitAssessment(answers));
      await cooldown.reload();
    } catch (failure) {
      if (failure instanceof EligibilityCooldownError) {
        cooldown.accept(failure.state);
        setSaved(failure.state.assessment);
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
            {cooldown.loading ? <Text style={styles.body}>Checking evaluation availability...</Text> : null}
            {cooldown.error ? <View style={styles.notice}>
              <Text accessibilityRole="alert" style={styles.body}>{cooldown.error}</Text>
              {<AssessmentButton label={'Retry availability check'} onPress={() => void cooldown.reload()} disabled={loading} busy={loading} />}
            </View> : null}
            {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
            {cooldown.state?.cooldown_active ? <View style={styles.notice}>
              <Text style={styles.subheading}>You already completed an evaluation recently.</Text>
              <Text style={styles.body}>{formatEligibilityWait(cooldown.remaining)}</Text>
              <Text style={styles.body}>Available again: {new Date(cooldown.state.next_allowed_at!).toLocaleString()}</Text>
            </View> : null}

            {/* PRE-SCREENING RESULT: display saved Laravel output, never a local decision. */}
            {showResult && result ? <>
              <View style={styles.card} accessibilityLiveRegion="polite">
                <Text style={styles.eyebrow}>Your Pre-Screening Result</Text>
                <Text style={[styles.title, { color: RESULTS[result.result].color }]}>{RESULTS[result.result].title}</Text>
                <Text style={styles.body}>{RESULTS[result.result].copy}</Text>
                {result.reasons.map((reason, index) => <Text key={index} style={styles.reason}>{reason}</Text>)}
                <Text style={styles.body}>{SCREENING_NOTICE}</Text>
              </View>
              {<AssessmentButton label={'View Status'} onPress={() => router.push('/(tabs)/status')} busy={loading} />}
              {<AssessmentButton label={'Back to Flowie'} onPress={() => router.push('/flowie')} disabled={false} secondary={true} busy={loading} />}
              {/* This facility note is informational, not an additional result. */}
              <View style={styles.card}>
                <Text style={styles.subheading}>Check with the donation facility</Text>
                <Text style={styles.body}>Recently had a tattoo or piercing, started a new medication, or have another health concern? Donation rules can vary, so confirm with the donation facility before donating.</Text>
              </View>
              {/* Preparation is informational and is never part of the answer payload. */}
              <View style={styles.card}>
                <Text style={styles.subheading}>Preparation Check</Text>
                <Text style={styles.body}>These reminders do not affect your pre-screening result.</Text>
                {PREPARATION.map(item => <Text key={item} style={styles.body}>{item}</Text>)}
              </View>
              {cooldown.canSubmit ? <AssessmentButton label={'Start a new assessment'} onPress={() => { setSaved(null); setDraft({}); go(-1); }} busy={loading} /> : null}
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
              {question.numeric ? <TextInput key={question.key} accessibilityLabel={question.text}
                keyboardType="decimal-pad" editable={!blocked} value={draft[question.key] || ''}
                placeholder={question.key === 'weight' ? 'Weight in kg' : 'Hours of sleep'}
                placeholderTextColor="#766A68" style={styles.input} maxLength={12}
                onChangeText={value => setDraft(current => ({ ...current, [question.key]: value }))} /> :
                (question.pregnancy ? ['YES', 'NO', 'NOT_APPLICABLE'] : ['YES', 'NO']).map(value => (
                  <Pressable key={value} accessibilityRole="radio" accessibilityLabel={answerLabel(value)}
                    accessibilityState={{ checked: draft[question.key] === value, disabled: blocked }} disabled={blocked}
                    onPress={() => { if (!blocked) setDraft(current => ({ ...current, [question.key]: value })); }}
                    style={[styles.option, draft[question.key] === value && styles.selected]}>
                    <Text style={[styles.body, draft[question.key] === value && styles.selectedText]}>{answerLabel(value)}</Text>
                  </Pressable>
                ))}
              {question.numeric ? <Text style={styles.hint}>{question.key === 'weight' ? 'Enter a number greater than zero.' : 'Enter hours from 0 to 24.'}</Text> : null}
              {<AssessmentButton label={'Next'} onPress={() => { if (validAnswer(question, draft[question.key])) go(step + 1); }} disabled={blocked || !validAnswer(question, draft[question.key])} busy={loading} />}
              {<AssessmentButton label={'Back'} onPress={() => go(step - 1)} disabled={blocked} secondary={true} busy={loading} />}
              <Text style={styles.hint}>{SCREENING_NOTICE}</Text>
            </View> : <View style={styles.card}>
              {/* REVIEW ANSWERS: question ten never submits automatically. */}
              <Text style={styles.title}>Review Answers</Text>
              <Text style={styles.body}>Please check all 10 answers. You can submit one assessment every 24 hours.</Text>
              {QUESTIONS.map((q, index) => <View key={q.key} style={styles.reviewRow}>
                <Text style={styles.subheading}>{index + 1}. {q.text}</Text>
                <Text style={styles.body}>{answerLabel(draft[q.key])}{q.key === 'weight' ? ' kg' : q.key === 'sleepHours' ? ' hours' : ''}</Text>
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

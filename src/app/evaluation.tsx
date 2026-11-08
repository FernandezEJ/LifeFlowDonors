import { formatDonorDateTime } from '@/services/date-presentation';
import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { LoadError } from '@/components/load-state';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { errorMessage } from '@/services/api';
import { useEligibilityCooldown } from '@/hooks/use-eligibility-cooldown';
import { EligibilityCooldownError, SCREENING_NOTICE, QUESTIONS, FOLLOW_UPS, selectAnswer, validQuestion, assessmentPresentation, type AssessmentDraft, type Question, type EligibilityAnswers, type EligibilityAssessment } from '@/services/eligibility';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ========================================
// SELF-ASSESSMENT QUESTION FLOW
// Answers stay in this screen until review. Only Laravel evaluates them.
// ========================================
export { QUESTIONS } from '@/services/eligibility';
export function validAnswer(_question: Question, value = ''): boolean {
  return value === 'YES' || value === 'NO';
}
function answerLabel(value?: string) {
  return value === 'YES' ? 'Yes' : value === 'NO' ? 'No' : 'Not answered';
}
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
  const [draft, setDraft] = useState<AssessmentDraft>({});
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
  const resultPresentation = assessmentPresentation(result);
  const resultColor = resultPresentation.tone === 'success' ? PALETTE.successText : PALETTE.pendingText;
  const showCooldown = !!cooldown.state?.cooldown_active && !showResult;
  // Initial availability owns the body; a submission or saved result keeps its current UI.
  const needsInitialAvailability = !cooldown.state && !saved && !loading;
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
    if (submitting.current || blocked || step !== QUESTIONS.length || !QUESTIONS.every(q => validQuestion(q, draft))) return;
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
          <MaterialIcons name="arrow-back" size={24} color={PALETTE.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Self-Assessment</Text>
        <NotificationBell />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            {needsInitialAvailability ? (
              cooldown.error && !cooldown.loading
                ? <LoadError message={cooldown.error} subject="assessment availability" retryLabel="Retry availability check" onRetry={cooldown.reload} />
                : <TabSkeleton variant="summary" label="Checking assessment availability" />
            ) : <>
            {cooldown.error ? <LoadError message={cooldown.error} subject="assessment availability" retryLabel="Retry availability check" loading={loading || cooldown.loading} onRetry={cooldown.reload} /> : null}
            {cooldown.loading && !loading ? <Text style={styles.hint} accessibilityLiveRegion="polite">Checking assessment availability...</Text> : null}
            {error && !showResult ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
            {showCooldown ? <View style={[styles.notice,{backgroundColor:PALETTE.pendingSurface}]}>
              <MaterialIcons name="schedule" size={28} color={PALETTE.primary} />
              <Text style={styles.subheading}>Self-Assessment Not Yet Available</Text>
              <Text style={styles.body}>You recently completed a self-assessment. You can complete another one after the current 24-hour assessment period ends.</Text>
              {cooldown.state?.next_allowed_at ? <Text style={styles.body}>Available again: {formatDonorDateTime(cooldown.state.next_allowed_at)}</Text> : null}
              <AssessmentButton label="Close" onPress={() => router.back()} />
            </View> : null}

            {/* PRE-SCREENING RESULT: display saved Laravel output, never a local decision. */}
            {showResult && result ? <>
              <View style={styles.complete}><MaterialIcons name="check-circle" size={22} color={PALETTE.successText} /><Text style={styles.subheading}>Assessment Complete</Text></View>
              <View style={styles.card} accessibilityLiveRegion="polite">
                <Text style={styles.eyebrow}>Your Pre-Screening Result</Text>
                <Text style={[styles.title, { color: resultColor }]}>{resultPresentation.title}</Text>
                <Text style={styles.body}>{resultPresentation.copy}</Text>
                <Text style={styles.body}>{SCREENING_NOTICE}</Text>
              </View>
              <View style={styles.notice}>
                <MaterialIcons name="info-outline" size={24} color={PALETTE.primary} />
                <Text style={styles.subheading}>Important Reminder</Text>
                <Text style={styles.body}>Discuss any questions about your answers with qualified blood donation personnel.</Text>
                <Text style={styles.body}>This result is preliminary guidance and does not confirm that a donation has occurred.</Text>
              </View>
              <AssessmentButton label="View Status" onPress={() => router.push('/(tabs)/status')} />
              <AssessmentButton label="Back to Flowie" onPress={() => router.push('/flowie')} secondary />
              {cooldown.canSubmit ? <AssessmentButton label={'Retake Self-Assessment'} onPress={() => { setSaved(null); setConflict(false); setDraft({}); go(-1); }} busy={loading} /> : null}
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
                  onPress={() => { if (!blocked) setDraft(current => selectAnswer(current, question, value)); }}
                  style={[styles.option, draft[question.key] === value && styles.selected]}>
                  <Text style={[styles.body, draft[question.key] === value && styles.selectedText]}>{answerLabel(value)}</Text>
                </Pressable>
              ))}
              {FOLLOW_UPS.filter(field => field.answer === question.key && draft[question.key] === 'YES').map(field => (
                <View key={field.key} style={{ gap: 8 }}>
                  <Text style={styles.subheading}>{field.label}</Text>
                  <TextInput accessibilityLabel={field.label} value={draft.follow_ups?.[field.key] ?? ''}
                    editable={!blocked} maxLength={200} autoCorrect={false}
                    onChangeText={value => setDraft(current => current[field.answer] === 'YES' ? { ...current, follow_ups: { ...current.follow_ups, [field.key]: value } } : current)}
                    style={styles.input} />
                </View>
              ))}
              {<AssessmentButton label={'Next'} onPress={() => { if (validQuestion(question, draft)) go(step + 1); }} disabled={blocked || !validQuestion(question, draft)} busy={loading} />}
              {<AssessmentButton label={'Back'} onPress={() => go(step - 1)} disabled={blocked} secondary={true} busy={loading} />}
              <Text style={styles.hint}>{SCREENING_NOTICE}</Text>
            </View> : <View style={styles.card}>
              {/* REVIEW ANSWERS: question ten never submits automatically. */}
              <Text style={styles.title}>Review Answers</Text>
              <Text style={styles.body}>Please check all 10 answers. You can submit one assessment every 24 hours.</Text>
              {QUESTIONS.map((q, index) => <View key={q.key} style={styles.reviewRow}>
                <Text style={styles.subheading}>{index + 1}. {q.text}</Text>
                <Text style={styles.body}>{answerLabel(draft[q.key])}</Text>
                {FOLLOW_UPS.filter(field => field.answer === q.key && draft[q.key] === 'YES').map(field => <Text key={field.key} style={styles.body}>{field.label} {draft.follow_ups?.[field.key]}</Text>)}
              </View>)}
              {<AssessmentButton label={'Edit Answers'} onPress={() => go(0)} disabled={blocked} secondary={true} busy={loading} />}
              {<AssessmentButton label={loading ? 'Submitting Assessment...' : 'Submit Assessment'} onPress={() => void submit()} disabled={blocked} busy={loading} />}
              <Text style={styles.hint}>{SCREENING_NOTICE}</Text>
            </View>}
            </>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </>;
}

const styles = StyleSheet.create({
  complete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: PALETTE.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, },
  headerTitle: { flex: 1, textAlign: 'center', color: PALETTE.text, fontSize: 17, fontWeight: '800' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 16 },
  card: { backgroundColor: PALETTE.surface, borderWidth: 1, borderColor: PALETTE.border, borderRadius: 22, padding: 20, gap: 18 },
  notice: { backgroundColor: PALETTE.infoSurface, borderRadius: 18, padding: 18, gap: 10 },
  title: { color: PALETTE.text, fontSize: 25, lineHeight: 33, fontWeight: '800' },
  subheading: { color: PALETTE.text, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  eyebrow: { color: PALETTE.danger, fontSize: 15, fontWeight: '800' },
  body: { color: PALETTE.neutralText, fontSize: 16, lineHeight: 24 },
  hint: { color: PALETTE.neutral, fontSize: 13, lineHeight: 20 },
  reason: { color: PALETTE.neutralText, fontSize: 16, lineHeight: 24, borderLeftWidth: 3, borderLeftColor: PALETTE.primary, paddingLeft: 12 },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: PALETTE.border },
  progressFill: { height: 8, backgroundColor: PALETTE.primary },
  input: { minHeight: 56, borderWidth: 1, borderColor: PALETTE.controlBorder, borderRadius: 14, padding: 14, fontSize: 20, color: PALETTE.text },
  option: { minHeight: 56, justifyContent: 'center', padding: 16, borderWidth: 1, borderColor: PALETTE.controlBorder, borderRadius: 14 },
  selected: { backgroundColor: PALETTE.primary, borderColor: PALETTE.primary }, selectedText: { color: PALETTE.surface },
  button: { minHeight: 52, padding: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: PALETTE.primary },
  buttonText: { color: PALETTE.surface, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  secondary: { backgroundColor: PALETTE.cream, borderWidth: 1, borderColor: PALETTE.primary }, secondaryText: { color: PALETTE.danger },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  reviewRow: { gap: 6, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: PALETTE.border },
});

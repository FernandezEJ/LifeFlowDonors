import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

type BooleanAnswer = 'YES' | 'NO' | null;
type BooleanQuestionKey = 'recentIllness' | 'medication' | 'recentDonation' | 'feelsWell';

const BOOLEAN_QUESTIONS: readonly { key: BooleanQuestionKey; question: string }[] = [
  { key: 'recentIllness', question: 'Have you had fever or illness recently?' },
  { key: 'medication', question: 'Are you currently taking medication?' },
  { key: 'recentDonation', question: 'Have you donated blood recently?' },
  { key: 'feelsWell', question: 'Do you feel well today?' },
];

export default function EvaluationScreen() {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [answers, setAnswers] = useState<Record<BooleanQuestionKey, BooleanAnswer>>({
    recentIllness: null,
    medication: null,
    recentDonation: null,
    feelsWell: null,
  });

  const updateAnswer = (key: BooleanQuestionKey, answer: Exclude<BooleanAnswer, null>) => {
    setAnswers((current) => ({ ...current, [key]: answer }));
  };

  const submitEvaluation = () => {
    const parsedWeight = Number(weight);
    const parsedSleep = Number(sleepHours);
    const hasEveryAnswer = Object.values(answers).every((answer) => answer !== null);

    if (!weight.trim() || !sleepHours.trim() || !hasEveryAnswer) {
      Alert.alert('Complete all fields', 'Please answer every evaluation question before submitting.');
      return;
    }

    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || !Number.isFinite(parsedSleep) || parsedSleep < 0) {
      Alert.alert('Check your entries', 'Enter valid numbers for weight and hours of sleep.');
      return;
    }

    // TODO: Later this evaluation will be sent to Laravel, which will evaluate and store the
    // result and update the user's current status. The frontend will not make that decision.
    Alert.alert('Evaluation submitted for frontend testing.');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.fixedHeader}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <MaterialIcons name="arrow-back" color={COLORS.text} size={23} />
            </Pressable>
            <Text style={styles.headerTitle}>Evaluation Form</Text>
            <Pressable
              accessibilityLabel="Open notifications"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
              <MaterialIcons name="notifications-none" color={COLORS.text} size={24} />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.intro}>
              <Text style={styles.introTitle}>Donation readiness check</Text>
              <Text style={styles.introText}>
                Answer these questions for this frontend demonstration. This form does not provide
                medical clearance.
              </Text>
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.questionNumber}>1</Text>
              <View style={styles.questionContent}>
                <Text style={styles.questionText}>Weight</Text>
                <TextInput
                  accessibilityLabel="Weight in kilograms"
                  keyboardType="decimal-pad"
                  onChangeText={setWeight}
                  placeholder="Enter weight in kg"
                  placeholderTextColor="#9B908D"
                  style={styles.input}
                  value={weight}
                />
              </View>
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.questionNumber}>2</Text>
              <View style={styles.questionContent}>
                <Text style={styles.questionText}>Hours of sleep last night</Text>
                <TextInput
                  accessibilityLabel="Hours of sleep last night"
                  keyboardType="decimal-pad"
                  onChangeText={setSleepHours}
                  placeholder="Enter hours of sleep"
                  placeholderTextColor="#9B908D"
                  style={styles.input}
                  value={sleepHours}
                />
              </View>
            </View>

            {BOOLEAN_QUESTIONS.map((item, index) => (
              <View key={item.key} style={styles.questionCard}>
                <Text style={styles.questionNumber}>{index + 3}</Text>
                <View style={styles.questionContent}>
                  <Text style={styles.questionText}>{item.question}</Text>
                  <View style={styles.answerRow}>
                    {(['YES', 'NO'] as const).map((answer) => {
                      const selected = answers[item.key] === answer;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={answer}
                          onPress={() => updateAnswer(item.key, answer)}
                          style={({ pressed }) => [
                            styles.answerButton,
                            selected && styles.answerButtonSelected,
                            pressed && styles.answerButtonPressed,
                          ]}>
                          <Text
                            style={[
                              styles.answerButtonText,
                              selected && styles.answerButtonTextSelected,
                            ]}>
                            {answer === 'YES' ? 'Yes' : 'No'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={submitEvaluation}
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}>
              <Text style={styles.submitButtonText}>Submit Evaluation</Text>
            </Pressable>

            <View style={styles.noticeCard}>
              <MaterialIcons name="info-outline" color={COLORS.brand} size={21} />
              <Text style={styles.noticeText}>
                This prototype does not calculate or permanently update donation eligibility.
              </Text>
            </View>

            {/* TODO: The Evaluation Form may later be highlighted as a Flowie FAQ/action.
                Flowie can explain donation information, but final eligibility must come from
                evaluation/backend logic rather than free-form AI conversation. */}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
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
    minHeight: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  bellButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 34 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 14 },
  intro: { marginBottom: 4 },
  introTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  introText: { marginTop: 7, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.white,
  },
  questionNumber: {
    width: 30,
    height: 30,
    overflow: 'hidden',
    color: COLORS.brand,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 30,
    textAlign: 'center',
    borderRadius: 15,
    backgroundColor: COLORS.softRed,
  },
  questionContent: { flex: 1 },
  questionText: { color: COLORS.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  input: {
    minHeight: 48,
    marginTop: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    fontSize: 15,
  },
  answerRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  answerButton: {
    minHeight: 43,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 14,
    backgroundColor: COLORS.background,
  },
  answerButtonSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.brand },
  answerButtonPressed: { opacity: 0.75 },
  answerButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  answerButtonTextSelected: { color: COLORS.white, fontWeight: '800' },
  submitButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 7,
    borderRadius: 17,
    backgroundColor: COLORS.brand,
  },
  submitButtonPressed: {
    backgroundColor: COLORS.brandPressed,
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 14,
    borderRadius: 16,
    backgroundColor: COLORS.softRed,
  },
  noticeText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});

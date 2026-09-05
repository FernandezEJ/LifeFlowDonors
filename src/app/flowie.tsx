import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const QUICK_ACTIONS = [
  { label: 'Can I donate?', icon: 'help-outline' as const },
  { label: 'Blood type information', icon: 'bloodtype' as const },
  { label: 'Donation preparation', icon: 'checklist' as const },
  { label: 'Donation interval', icon: 'event-repeat' as const },
  { label: 'LifeFlow help', icon: 'support-agent' as const },
];

export default function FlowieScreen() {
  const router = useRouter();

  const openQuickAction = (label: string) => {
    Alert.alert(label, 'Flowie answers will be available in a future frontend update.');
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
            <Text style={styles.headerTitle}>Flowie</Text>
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

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.welcomeCard}>
              <Image
                accessibilityLabel="Flowie, the LifeFlow assistant"
                resizeMode="contain"
                source={require('../../assets/images/EvalMascot.png')}
                style={styles.mascot}
              />
              <View style={styles.welcomeContent}>
                <Text style={styles.welcomeTitle}>Hi, I&apos;m Flowie!</Text>
                <Text style={styles.welcomeText}>
                  Choose a quick action below for help with your blood donation journey.
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Update your status</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/evaluation')}
                style={({ pressed }) => [
                  styles.evaluationAction,
                  pressed && styles.evaluationActionPressed,
                ]}>
                <View style={styles.evaluationIcon}>
                  <MaterialIcons name="assignment" color={COLORS.brand} size={27} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.evaluationTitle}>Evaluation Form</Text>
                  <Text style={styles.evaluationSubtitle}>
                    Complete this to update your donation status.
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" color={COLORS.brand} size={25} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick questions</Text>
              <View style={styles.quickActionList}>
                {QUICK_ACTIONS.map((action) => (
                  <Pressable
                    accessibilityRole="button"
                    key={action.label}
                    onPress={() => openQuickAction(action.label)}
                    style={({ pressed }) => [
                      styles.quickAction,
                      pressed && styles.quickActionPressed,
                    ]}>
                    <View style={styles.quickActionIcon}>
                      <MaterialIcons name={action.icon} color={COLORS.brand} size={21} />
                    </View>
                    <Text style={styles.quickActionText}>{action.label}</Text>
                    <MaterialIcons name="chevron-right" color={COLORS.muted} size={23} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.noticeCard}>
              <MaterialIcons name="info-outline" color={COLORS.brand} size={22} />
              <Text style={styles.noticeText}>
                Flowie is a frontend prototype. It does not provide final medical eligibility
                decisions or medical clearance.
              </Text>
            </View>

            {/* TODO: Flowie may later retrieve approved donation information through Laravel.
                Final eligibility must come from stored evaluation/backend logic, not free-form AI.
                Laravel will evaluate/store form results and update the user's Status. */}
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
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 24 },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 21,
    backgroundColor: COLORS.white,
  },
  mascot: { width: 104, height: 104 },
  welcomeContent: { flex: 1 },
  welcomeTitle: { color: COLORS.brand, fontSize: 21, fontWeight: '800' },
  welcomeText: { marginTop: 6, color: COLORS.text, fontSize: 14, lineHeight: 20 },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  evaluationAction: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8AAA3',
    borderRadius: 20,
    backgroundColor: COLORS.softRed,
    shadowColor: '#8B3028',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },
  evaluationActionPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  evaluationIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  actionContent: { flex: 1 },
  evaluationTitle: { color: COLORS.brand, fontSize: 17, fontWeight: '800' },
  evaluationSubtitle: { marginTop: 4, color: COLORS.text, fontSize: 13, lineHeight: 18 },
  quickActionList: { gap: 9 },
  quickAction: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 17,
    backgroundColor: COLORS.white,
  },
  quickActionPressed: { opacity: 0.72 },
  quickActionIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  quickActionText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 15,
    borderRadius: 17,
    backgroundColor: COLORS.softRed,
  },
  noticeText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});

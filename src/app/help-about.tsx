import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useState } from 'react';
import Constants from 'expo-constants';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileSettingsPage } from '@/components/profile-settings-page';
import { RegistrationLegal, PRESCREENING_ACKNOWLEDGEMENT } from '@/components/registration-legal';

// Replace each "Name" below with a developer's name.
const DEVELOPER_NAMES = ['Ferdinand EJ R. Fernandez', 'Mark Ivy Javines', 'Chloe Ellamil', 'Yul Dave Bungay'] as const;

const FAQS = [
  ['What is LifeFlow?', 'LifeFlow helps donors manage their profile, donation readiness, activities and rewards in one place.'],
  ['Is the self-assessment a final medical decision?', 'No. It provides pre-screening guidance only. The donation facility makes the final eligibility decision.'],
  ['How do I change my email or password?', 'Open Profile Settings from Profile, then choose Change Email or Change Password. Both require your current password; a new email must also be verified.'],
  ['How do I earn points?', 'Points are awarded when a donation is verified as completed. Uploading proof alone does not earn points. Open Points to see your balance, history and available rewards.'],
  ['Where can I see my donation activity?', 'Open Activity to view your participations and their current status. Open an activity for its details.'],
] as const;

// One scrolling overview; legal documents reuse the registration reader and content.
export default function HelpAboutScreen() {
  const [document, setDocument] = useState<'terms' | 'privacy' | null>(null);
  return <>
    <ProfileSettingsPage title="About LifeFlow" fallback="/(tabs)/profile">
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>About LifeFlow</Text>
        <Text style={styles.body}>LifeFlow is a donor-focused blood donation support app. It helps you prepare for donation, follow your activities and find app guidance.</Text>
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>How LifeFlow Works</Text>
        <Text style={styles.body}>Keep your donor details in Profile. Use the self-assessment for pre-screening guidance, and track your participations in Activity. Points and Rewards reflect verified donations and available rewards. Notifications keep important updates together. Flowie offers guided app and donation information.</Text>
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>Frequently Asked Questions</Text>
        {FAQS.map(([question, answer]) => <View key={question} style={styles.question}>
          <Text style={styles.questionTitle}>{question}</Text><Text style={styles.body}>{answer}</Text>
        </View>)}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>Donation Disclaimer</Text>
        <Text style={styles.body}>{PRESCREENING_ACKNOWLEDGEMENT}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => setDocument('terms')} style={styles.link}>
        <Text style={styles.linkText}>Terms and Conditions</Text><Text style={styles.body}>Read the existing LifeFlow terms.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setDocument('privacy')} style={styles.link}>
        <Text style={styles.linkText}>Privacy Policy</Text><Text style={styles.body}>Read how LifeFlow handles your information.</Text>
      </Pressable>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>Contact / Support</Text>
        <Text style={styles.body}>Support contact details are not yet available in the app. For donation-specific questions, contact the donation facility.</Text>
      </View>
      <View style={styles.section}>
        <View style={styles.developerHeading}>
          <View style={styles.developerIcon}><MaterialIcons name="groups" size={22} color={PALETTE.primary} accessible={false} importantForAccessibility="no" /></View>
          <Text accessibilityRole="header" style={[styles.heading, styles.developerHeadingText]}>Meet the Developers</Text>
        </View>
        <Text style={styles.body}>LifeFlow is a capstone project supporting blood donation awareness and donor engagement.</Text>
        <View style={styles.developerCard}>
          <Text accessibilityRole="header" style={styles.teamTitle}>LifeFlow Development Team</Text>
          {DEVELOPER_NAMES.map((name, index) => <Text key={index} style={styles.developerName}>{name}</Text>)}
        </View>
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>App Version</Text>
        <Text style={styles.body}>{Constants.expoConfig?.version ?? 'Not available'}</Text>
      </View>
    </ProfileSettingsPage>
    <RegistrationLegal document={document} onClose={() => setDocument(null)} backLabel="Back to About LifeFlow" />
  </>;
}
const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { color: PALETTE.text, fontSize: 19, fontWeight: '700' },
  body: { color: PALETTE.neutralText, fontSize: 14, lineHeight: 22 },
  question: { gap: 5, marginTop: 6 },
  questionTitle: { color: PALETTE.text, fontSize: 15, fontWeight: '700' },
  link: { minHeight: 54, justifyContent: 'center', gap: 5, paddingVertical: 8 },
  linkText: { color: PALETTE.primary, fontSize: 17, fontWeight: '700' },
  developerHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  developerHeadingText: { flex: 1, minWidth: 0 },
  developerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: PALETTE.pastelPink, alignItems: 'center', justifyContent: 'center' },
  developerCard: { padding: 16, gap: 10, borderWidth: 1, borderColor: PALETTE.pastelPink, borderRadius: 18, backgroundColor: PALETTE.surface },
  teamTitle: { color: PALETTE.text, fontSize: 15, lineHeight: 23, fontWeight: '700' },
  developerName: { color: PALETTE.text, fontSize: 15, lineHeight: 23 },
});

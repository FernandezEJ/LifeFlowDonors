import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const PRESCREENING_ACKNOWLEDGEMENT = 'I understand that LifeFlow provides self-assessment guidance only and that final donation eligibility is determined by the donation facility.';
export const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Terms and Conditions', version: '1.0',
    sections: [
      ['About LifeFlow', 'LifeFlow is a donor-focused blood donation support app developed as a capstone project. It supports donor activities, self-assessment, donation opportunities, points and rewards, and app guidance.'],
      ['User responsibilities', 'Provide accurate information, use your own account, and keep your credentials secure. Do not misuse the app or submit false or misleading information.'],
      ['Donation readiness and pre-screening', 'LifeFlow self-assessment provides informational pre-screening guidance only. It is not a medical diagnosis or a guarantee that you can donate. Final donation eligibility is determined by the donation facility and authorized professionals.'],
      ['Donation proof and verification', 'Submitted donation proof may be reviewed through authorized verification workflows. False or misleading proof may be rejected. Uploading proof alone does not confirm a completed donation.'],
      ['Points and rewards', 'Points and rewards depend on LifeFlow rules and verified activity. Rewards depend on availability and finite stock. Points are not cash unless explicitly stated. Follow the displayed voucher activation instructions before using a reward.'],
      ['Account use', 'Use only your own account and respect other users. Misuse may result in restriction or removal where supported by the app and its authorized processes.'],
      ['Service changes', 'Features, availability and app rules may change as this capstone project evolves. Review the current instructions when using a feature.'],
      ['Questions', 'Open About LifeFlow for project information, app guidance, and the current Privacy Policy.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy', version: '1.1',
    sections: [
      ['Information collected', 'LifeFlow processes your name, email, Philippine contact number, birth date, gender and blood type; self-assessment answers and results; donation participation and proof files; points, rewards, selected apparel sizes and claim activity; registration acknowledgements; and Flowie conversations. If you enable phone notifications on a supported device, LifeFlow also processes its notification token.'],
      ['How information is used', 'These records support email-code sign-in and verification, your donor profile, self-assessment, donation activities, authorized proof review, points and rewards, notifications, and app security. Configured email delivery processes email addresses and verification or recovery codes, including secure Change Email checks.'],
      ['Self-assessment information', 'LifeFlow uses a 10-question preliminary donor self-assessment that may collect health-related responses, including procedure details and timing, medications or supplements, and blood transfusion timing. Submitted answers are stored as part of your assessment history; the 24-hour reassessment interval does not mean those answers are deleted. Results provide preliminary guidance, not a diagnosis or final medical eligibility. Qualified blood donation personnel perform final screening and determine donation eligibility.'],
      ['Storage and services', 'The Laravel backend and MySQL store account and application records. Depending on configured storage, application images and restricted donation-proof objects use Cloudflare R2 or local server storage; historical local files may remain. Proofs are accessed through authenticated owner or authorized staff review routes. Firebase Cloud Messaging handles push delivery using device tokens and notification content; it is not LifeFlow\'s donation-proof storage.'],
      ['Flowie and Groq', 'When Flowie contacts Groq, it sends your question, up to six recent conversation messages, and a selected snapshot of your own donor state: first name, blood type, assessment result and time/currentness, donation rest period and next donation date, active activity status and readable title, completed donation count, Blood Points balance and achievement. This snapshot accompanies general questions too. It excludes your email, contact number, full profile, raw assessment answers and proof files. Information you type yourself is still sent as chat text, so avoid unnecessary sensitive details, documents, passwords or verification codes.'],
      ['Conversation history', 'LifeFlow separately saves your Flowie messages and replies in your account history. The selected donor snapshot is request context, not a separate saved chat message. Ending a chat keeps its history. Deleted chats have a 30-day recovery window and become eligible for permanent removal by LifeFlow\'s cleanup process afterward. This app control does not promise deletion from Groq or other service providers.'],
      ['Access and review', 'Your account provides access to your own supported records. Authorized Admin and Super Admin accounts review submitted proofs and manage announcements, rewards and related records under their permissions. Services receive the information needed for their configured processing, such as Groq chat requests, push delivery or verification email delivery.'],
      ['Security and choices', 'LifeFlow uses authenticated access, temporary verification codes and other controls, but cannot guarantee complete security. Keep sign-in codes private. You can edit supported profile details, use secure Change Email, manage phone notification permission and sound settings, and manage Flowie history. Push permission is separate from registration.'],
      ['Retention and questions', 'Account, donation, verification, points and reward history may remain for app operation and history; deleting a chat does not delete these records. This notice does not specify a universal deletion period or provider retention terms. Open About LifeFlow for guidance. If a support address is configured, Trouble signing in offers Contact LifeFlow Support. Provider retention, data locations and formal privacy-request procedures require confirmation from the LifeFlow operator.'],
    ],
  },
} as const;

// One in-app reader keeps legal copy out of the form and preserves its in-memory state.
export function RegistrationLegal({ document, onClose, onAgree, backLabel = 'Back to registration' }: { document: keyof typeof LEGAL_DOCUMENTS | null; onClose: () => void; onAgree?: (document: keyof typeof LEGAL_DOCUMENTS) => void; backLabel?: string }) {
  const content = document ? LEGAL_DOCUMENTS[document] : null;
  return <Modal visible={content !== null} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onClose} style={styles.back}>
          <MaterialIcons name="arrow-back" color={PALETTE.primary} size={24} /><Text style={styles.text}>Back</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{content?.title}</Text>
        <Text style={styles.text}>Version {content?.version}</Text>
      </View>
      <ScrollView key={document} contentContainerStyle={styles.content}>
        {content?.sections.map(([heading, text]) => <View key={heading} style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
          <Text selectable style={styles.text}>{text}</Text>
        </View>)}
      </ScrollView>
      {onAgree ? <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.action, styles.cancel]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { if (document) onAgree(document); }} style={[styles.action, styles.agree]}><Text style={styles.agreeText}>I Agree</Text></Pressable>
      </View> : null}
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.cream },
  header: { padding: 24, gap: 12, width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '800', color: PALETTE.text },
  content: { padding: 24, paddingTop: 0, gap: 24, width: '100%', maxWidth: 680, alignSelf: 'center' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 12, width: '100%', maxWidth: 680, alignSelf: 'center' },
  action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 12 },
  cancel: { borderWidth: 1, borderColor: PALETTE.primary },
  agree: { backgroundColor: PALETTE.primary },
  cancelText: { color: PALETTE.primary, fontSize: 16, fontWeight: '700' },
  agreeText: { color: PALETTE.surface, fontSize: 16, fontWeight: '700' },
  section: { gap: 8 }, heading: { fontSize: 20, fontWeight: '700', color: PALETTE.text },
  text: { fontSize: 16, lineHeight: 24, color: PALETTE.neutralText },
});

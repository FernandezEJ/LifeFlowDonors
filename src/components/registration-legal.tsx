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
      ['Questions', 'A future Help/About section is planned for project information and guidance. It is not available yet.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy', version: '1.0',
    sections: [
      ['Information collected', 'LifeFlow processes your name, email, mobile number, birth date, gender and blood type; self-assessment answers and results; donation participation and activity; donation proof files and metadata; points, rewards and voucher activity; and registration acknowledgements. When important notifications are enabled on a supported device, it also processes the device notification token.'],
      ['How information is used', 'Information supports account authentication, your donor profile, self-assessment, donation participation, proof verification, points and rewards, important notifications, and app operation and security. Registration and password-reset codes are used to verify access to your email.'],
      ['Self-assessment information', 'Answers are evaluated using deterministic LifeFlow readiness and pre-screening rules. Results are not a diagnosis or medical clearance. The donation facility determines final eligibility.'],
      ['Storage and services', 'Laravel and MySQL manage account and application data. Pending registration details are encrypted and passwords are hashed. Firebase may store donation proof files and support device notifications when those features are configured. Gmail SMTP processes registration and password-reset verification emails.'],
      ['Processing and review', 'Relevant information may be processed by the services needed to operate LifeFlow, including its database, Firebase features and Gmail email delivery. Donation-related information may be reviewed through authorized verification and future admin workflows when implemented.'],
      ['Security', 'LifeFlow uses password hashing, temporary verification codes, authenticated access and other security controls. These measures reduce risk, but no system can guarantee complete security. Keep your password and email codes private.'],
      ['Your choices', 'You can update supported profile details, use Forgot Password, and manage notification permission through the app or device settings as supported. Enabling optional push notifications is separate from registration.'],
      ['Retention', 'Data may be retained as needed for app functionality, history, security, verification and project requirements.'],
      ['Questions', 'A future Help/About section is planned for project information and guidance. It is not available yet.'],
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
          <MaterialIcons name="arrow-back" color="#372E2E" size={24} /><Text style={styles.text}>Back</Text>
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
  safe: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { padding: 24, gap: 12, width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '800', color: '#D93A3A' },
  content: { padding: 24, paddingTop: 0, gap: 24, width: '100%', maxWidth: 680, alignSelf: 'center' },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingVertical: 12, width: '100%', maxWidth: 680, alignSelf: 'center' },
  action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 12 },
  cancel: { borderWidth: 1, borderColor: '#D93A3A' },
  agree: { backgroundColor: '#D93A3A' },
  cancelText: { color: '#D93A3A', fontSize: 16, fontWeight: '700' },
  agreeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  section: { gap: 8 }, heading: { fontSize: 20, fontWeight: '700', color: '#372E2E' },
  text: { fontSize: 16, lineHeight: 24, color: '#534846' },
});

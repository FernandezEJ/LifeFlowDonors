import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type ActivityStatus = 'PENDING' | 'FOR_VERIFICATION' | 'COMPLETED' | 'CANCELLED';

type ActivityDetail = {
  id: string;
  title: string;
  organizer: string;
  date: string;
  time: string;
  location: string;
  description: string;
  status: ActivityStatus;
  reward: string;
};

const ACTIVITY_DETAILS: Record<string, ActivityDetail> = {
  '1': {
    id: '1',
    title: 'Community Bloodletting Activity',
    organizer: 'LifeFlow',
    date: 'September 12, 2026',
    time: '9:00 AM - 3:00 PM',
    location: 'Sample Community Center',
    description:
      'Join the community blood donation activity and help support patients who need lifesaving blood.',
    status: 'PENDING',
    reward: '550 Blood Points',
  },
  '2': {
    id: '2',
    title: 'Philippine Red Cross Donation',
    organizer: 'Philippine Red Cross',
    date: 'June 10, 2026',
    time: '10:00 AM - 2:00 PM',
    location: 'Philippine Red Cross Blood Center',
    description:
      'A completed voluntary blood donation recorded through a Philippine Red Cross blood service facility.',
    status: 'COMPLETED',
    reward: '350 Blood Points',
  },
  '3': {
    id: '3',
    title: 'University Blood Donation Day',
    organizer: 'LifeFlow',
    date: 'August 22, 2026',
    time: '8:30 AM - 4:00 PM',
    location: 'University Activity Hall',
    description:
      'A campus blood donation activity organized to make safe blood more accessible to the community.',
    status: 'FOR_VERIFICATION',
    reward: '450 Blood Points',
  },
  '4': {
    id: '4',
    title: 'Community Mobile Blood Drive',
    organizer: 'LifeFlow',
    date: 'May 18, 2026',
    time: '9:00 AM - 1:00 PM',
    location: 'Community Covered Court',
    description:
      'A mobile bloodletting activity created to connect nearby donors with a local donation team.',
    status: 'CANCELLED',
    reward: 'Not awarded',
  },
};

const STATUS_STYLES: Record<
  ActivityStatus,
  { background: string; color: string; label: string }
> = {
  PENDING: { background: '#FFF1D6', color: '#A76500', label: 'Pending' },
  FOR_VERIFICATION: { background: '#E6F0FF', color: '#3469A5', label: 'For Verification' },
  COMPLETED: { background: '#E2F5E9', color: '#287A47', label: 'Completed' },
  CANCELLED: { background: '#F1ECEA', color: '#8A5F59', label: 'Cancelled' },
};

type DetailRowProps = {
  icon: 'event' | 'schedule' | 'location-on' | 'business';
  label: string;
  value: string;
};

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <MaterialIcons name={icon} color={COLORS.brand} size={20} />
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const activityId = Array.isArray(id) ? id[0] : id;
  const activity = ACTIVITY_DETAILS[activityId ?? '1'] ?? ACTIVITY_DETAILS['1'];
  const [status, setStatus] = useState<ActivityStatus>(activity.status);
  const statusStyle = STATUS_STYLES[status];
  const isPending = status === 'PENDING';
  const isForVerification = status === 'FOR_VERIFICATION';
  const isCompleted = status === 'COMPLETED';

  const submitProof = () => {
    Alert.alert(
      'Submit donation proof?',
      'This frontend demo will mark your proof as waiting for verification.',
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Submit',
          onPress: () => {
            // TODO: Upload proof through Laravel and send it to an admin verification workflow.
            // After approval, Laravel will complete the donation, create the points transaction,
            // update the donation count, and allow the eligibility/status system to recalculate.
            setStatus('FOR_VERIFICATION');
          },
        },
      ],
    );
  };

  const cancelParticipation = () => {
    Alert.alert('Cancel Participation', 'Are you sure you want to cancel this activity?', [
      { text: 'Keep Activity', style: 'cancel' },
      {
        text: 'Cancel Participation',
        style: 'destructive',
        onPress: () => setStatus('CANCELLED'),
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <MaterialIcons name="arrow-back" color={COLORS.text} size={23} />
          </Pressable>
          <Text style={styles.headerTitle}>Activity Details</Text>
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

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.titleBlock}>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.background }]}>
                <Text style={[styles.statusText, { color: statusStyle.color }]}>
                  {statusStyle.label}
                </Text>
              </View>
              <Text style={styles.title}>{activity.title}</Text>
              <Text style={styles.organizer}>Organized by {activity.organizer}</Text>
            </View>

            <View style={styles.detailsCard}>
              <DetailRow icon="event" label="Date" value={activity.date} />
              <DetailRow icon="schedule" label="Time" value={activity.time} />
              <DetailRow icon="location-on" label="Location" value={activity.location} />
              <DetailRow icon="business" label="Organizer" value={activity.organizer} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About this activity</Text>
              <Text style={styles.description}>{activity.description}</Text>
            </View>

            <View style={styles.rewardCard}>
              <View style={styles.rewardIcon}>
                <MaterialIcons name="stars" color={COLORS.brand} size={25} />
              </View>
              <View style={styles.rewardContent}>
                <Text style={styles.rewardLabel}>
                  {isCompleted ? 'Earned reward' : 'Expected reward'}
                </Text>
                <Text
                  style={[styles.rewardValue, status === 'CANCELLED' && styles.cancelledReward]}>
                  {status === 'CANCELLED' ? 'Not awarded' : activity.reward}
                </Text>
                {!isCompleted && status !== 'CANCELLED' ? (
                  <Text style={styles.rewardNote}>
                    Points are credited only after an admin verifies the donation proof.
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.proofCard}>
              <View style={styles.proofHeading}>
                <View style={styles.proofIcon}>
                  <MaterialIcons name="upload-file" color={COLORS.brand} size={24} />
                </View>
                <Text style={styles.sectionTitle}>Proof of Donation</Text>
              </View>

              {isPending ? (
                <>
                  <Text style={styles.description}>
                    After donating, upload your donation certificate or other accepted proof for
                    verification.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={submitProof}
                    style={({ pressed }) => [
                      styles.uploadButton,
                      pressed && styles.uploadButtonPressed,
                    ]}>
                    <MaterialIcons name="upload-file" color={COLORS.white} size={20} />
                    <Text style={styles.uploadButtonText}>Upload Certificate</Text>
                  </Pressable>
                </>
              ) : null}

              {isForVerification ? (
                <View style={styles.verificationMessage}>
                  <MaterialIcons name="hourglass-top" color="#3469A5" size={20} />
                  <Text style={styles.verificationText}>
                    Your proof has been submitted and is waiting for verification.
                  </Text>
                </View>
              ) : null}

              {isCompleted ? (
                <View style={styles.completedMessage}>
                  <MaterialIcons name="verified" color="#287A47" size={20} />
                  <Text style={styles.completedText}>Your donation proof has been verified.</Text>
                </View>
              ) : null}

              {status === 'CANCELLED' ? (
                <Text style={styles.cancelledMessage}>
                  This participation was cancelled, so proof submission is unavailable.
                </Text>
              ) : null}
            </View>

            {isCompleted ? (
              <View style={styles.eligibilityNote}>
                <MaterialIcons name="health-and-safety" color={COLORS.brand} size={22} />
                <Text style={styles.eligibilityText}>
                  Your next donation eligibility will be determined after your donation record is
                  verified.
                </Text>
                {/* TODO: The Laravel eligibility/status system will later calculate the next
                    eligible donation date according to the project's approved donation rules. */}
              </View>
            ) : null}

            {isPending ? (
              <Pressable
                accessibilityRole="button"
                onPress={cancelParticipation}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.cancelButtonPressed,
                ]}>
                <Text style={styles.cancelButtonText}>Cancel Participation</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  titleBlock: { alignItems: 'flex-start' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  title: {
    marginTop: 13,
    color: COLORS.text,
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  organizer: { marginTop: 5, color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  detailsCard: {
    gap: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  detailContent: { flex: 1 },
  detailLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  detailValue: { marginTop: 2, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  section: {
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  sectionTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '800' },
  description: { marginTop: 8, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 20,
    backgroundColor: COLORS.softRed,
  },
  rewardIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  rewardContent: { flex: 1 },
  rewardLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  rewardValue: { marginTop: 3, color: COLORS.brand, fontSize: 17, fontWeight: '800' },
  cancelledReward: { color: COLORS.muted },
  rewardNote: { marginTop: 6, color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  proofCard: {
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E8BBB5',
    borderRadius: 21,
    backgroundColor: COLORS.white,
  },
  proofHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  proofIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.softRed,
  },
  uploadButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
  uploadButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  uploadButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  verificationMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#E6F0FF',
  },
  verificationText: { flex: 1, color: '#3469A5', fontSize: 13, lineHeight: 19 },
  completedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#E2F5E9',
  },
  completedText: { flex: 1, color: '#287A47', fontSize: 13, lineHeight: 19 },
  cancelledMessage: { marginTop: 13, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  eligibilityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: 17,
    backgroundColor: COLORS.softRed,
  },
  eligibilityText: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 19 },
  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  cancelButtonPressed: { backgroundColor: COLORS.softRed },
  cancelButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: '700' },
});

// TODO: Donation reward rules will later be provided and validated by Laravel/backend configuration.

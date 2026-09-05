import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
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
  locked: '#B6ACA8',
  lockedBackground: '#EEE9E6',
};

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

type MockUser = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  mobile: string;
  birthDate: string;
  gender: string;
  bloodType: string;
  totalDonations: number;
  streakCount: number;
};

type Achievement = {
  title: string;
  requiredDonations: number;
  icon: MaterialIconName;
  color: string;
  background: string;
};

const MOCK_USER: MockUser = {
  firstName: 'Juan',
  middleName: 'Santos',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  mobile: '09171234567',
  birthDate: '09/17/2004',
  gender: 'Male',
  bloodType: 'O+',
  totalDonations: 3,
  streakCount: 2,
};

const VERIFIED_DONATIONS = 3;

const ACHIEVEMENTS: readonly Achievement[] = [
  { title: 'Bronze Donor', requiredDonations: 1, icon: 'workspace-premium', color: '#A86432', background: '#F5E5D8' },
  { title: 'Silver Donor', requiredDonations: 3, icon: 'workspace-premium', color: '#78838D', background: '#E9EDF0' },
  { title: 'Gold Donor', requiredDonations: 5, icon: 'workspace-premium', color: '#B97700', background: '#FFF1D6' },
  { title: 'Platinum Donor', requiredDonations: 10, icon: 'workspace-premium', color: '#66808E', background: '#E5EEF1' },
  { title: 'Diamond Donor', requiredDonations: 20, icon: 'diamond', color: '#2589A6', background: '#E0F3F7' },
  { title: 'LifeFlow Hero', requiredDonations: 30, icon: 'auto-awesome', color: '#B23A79', background: '#F9E3EF' },
];

const CURRENT_MEDAL = ACHIEVEMENTS.reduce<Achievement | null>(
  (highest, achievement) =>
    VERIFIED_DONATIONS >= achievement.requiredDonations ? achievement : highest,
  null,
);

const PERSONAL_INFORMATION = [
  { label: 'First Name', value: MOCK_USER.firstName },
  { label: 'Middle Name', value: MOCK_USER.middleName },
  { label: 'Last Name', value: MOCK_USER.lastName },
  { label: 'Email', value: MOCK_USER.email },
  { label: 'Mobile Number', value: MOCK_USER.mobile },
  { label: 'Birth Date', value: MOCK_USER.birthDate },
  { label: 'Gender', value: MOCK_USER.gender },
  { label: 'Blood Type', value: MOCK_USER.bloodType },
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const fullName = `${MOCK_USER.firstName} ${MOCK_USER.lastName}`;

  const showPlaceholder = (title: string, message: string) => {
    Alert.alert(title, message);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => router.replace('/(auth)/login'),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable
            accessibilityLabel="Open notifications"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}>
            <MaterialIcons name="notifications-none" color={COLORS.text} size={25} />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.profileHero}>
            <View style={styles.avatarArea}>
              <View accessibilityLabel={`${fullName} profile picture`} style={styles.avatar}>
                <Text style={styles.avatarInitials}>JD</Text>
              </View>
              <Pressable
                accessibilityLabel="Change profile photo"
                accessibilityRole="button"
                hitSlop={7}
                onPress={() =>
                  showPlaceholder('Change Photo', 'Profile photo upload will be available later.')
                }
                style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}>
                <MaterialIcons name="photo-camera" color={COLORS.white} size={17} />
              </Pressable>
            </View>
            <Text style={styles.donorName}>{fullName}</Text>
            <Text style={styles.donorLabel}>LifeFlow Donor</Text>
            <View style={styles.bloodTypeBadge}>
              <MaterialIcons name="bloodtype" color={COLORS.brand} size={17} />
              <Text style={styles.bloodTypeText}>{MOCK_USER.bloodType}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <MaterialIcons name="bloodtype" color={COLORS.brand} size={26} />
              </View>
              <Text style={styles.statNumber}>{MOCK_USER.totalDonations}</Text>
              <Text style={styles.statLabel}>Total Donations</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <MaterialIcons name="local-fire-department" color={COLORS.brand} size={26} />
              </View>
              <Text style={styles.statNumber}>{MOCK_USER.streakCount}</Text>
              <Text style={styles.statLabel}>Streak Count</Text>
            </View>
          </View>

          {/* TODO: Donation totals and streaks will come from verified Laravel donation records. */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            {CURRENT_MEDAL ? (
              <View style={styles.currentMedalCard}>
                <View style={[styles.currentMedalIcon, { backgroundColor: CURRENT_MEDAL.background }]}>
                  <MaterialIcons
                    name={CURRENT_MEDAL.icon}
                    color={CURRENT_MEDAL.color}
                    size={27}
                  />
                </View>
                <View style={styles.currentMedalContent}>
                  <Text style={styles.currentMedalLabel}>Current Medal</Text>
                  <Text style={styles.currentMedalTitle}>{CURRENT_MEDAL.title}</Text>
                </View>
                <MaterialIcons name="verified" color={COLORS.brand} size={22} />
              </View>
            ) : null}
            <ScrollView
              horizontal
              contentContainerStyle={styles.achievementList}
              showsHorizontalScrollIndicator={false}>
              {ACHIEVEMENTS.map((achievement) => {
                const unlocked = VERIFIED_DONATIONS >= achievement.requiredDonations;

                return (
                  <View
                    key={achievement.title}
                    style={[
                      styles.achievementCard,
                      {
                        borderColor: unlocked ? achievement.color : COLORS.border,
                        backgroundColor: unlocked
                          ? achievement.background
                          : COLORS.lockedBackground,
                      },
                      !unlocked && styles.achievementCardLocked,
                    ]}>
                    <View style={styles.achievementIcon}>
                      <MaterialIcons
                        name={achievement.icon}
                        color={unlocked ? achievement.color : COLORS.locked}
                        size={29}
                      />
                    </View>
                    <Text
                      style={[
                        styles.achievementTitle,
                        !unlocked && styles.achievementTitleLocked,
                      ]}>
                      {achievement.title}
                    </Text>
                    <Text style={styles.achievementRequirement}>
                      {achievement.requiredDonations}{' '}
                      {achievement.requiredDonations === 1 ? 'Donation' : 'Donations'}
                    </Text>
                    <View style={styles.achievementStatus}>
                      <MaterialIcons
                        name={unlocked ? 'check-circle' : 'lock'}
                        color={unlocked ? achievement.color : COLORS.locked}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.achievementStatusText,
                          { color: unlocked ? achievement.color : COLORS.locked },
                        ]}>
                        {unlocked ? 'Unlocked' : 'Locked'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <Text style={styles.achievementNote}>
              Medals recognize long-term verified participation. Always follow the donation timing
              guidance in Status and Evaluation.
            </Text>
            {/* TODO: Verified donation count will come from Laravel/backend. Only completed,
                verified donations—not pending, cancelled, or awaiting-verification activities—
                will count toward medals under backend achievement rules. */}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.informationCard}>
              {PERSONAL_INFORMATION.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.informationRow,
                    index < PERSONAL_INFORMATION.length - 1 && styles.informationRowBorder,
                  ]}>
                  <Text style={styles.informationLabel}>{item.label}</Text>
                  <Text selectable style={styles.informationValue}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                showPlaceholder('Edit Profile', 'Profile editing will be connected later.')
              }
              style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
              <MaterialIcons name="edit" color={COLORS.brand} size={19} />
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </Pressable>
            {/* TODO: Profile edits will be validated and saved through Laravel. Changed email or
                mobile values must be checked for uniqueness against other accounts. */}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.accountCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  showPlaceholder('Settings', 'Account settings will be available later.')
                }
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.accountIcon}>
                  <MaterialIcons name="settings" color={COLORS.text} size={21} />
                </View>
                <Text style={styles.accountText}>Settings</Text>
                <MaterialIcons name="chevron-right" color={COLORS.muted} size={23} />
              </Pressable>
              <View style={styles.accountSeparator} />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  showPlaceholder('About LifeFlow', 'LifeFlow donor help and information is coming soon.')
                }
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.accountIcon}>
                  <MaterialIcons name="help-outline" color={COLORS.text} size={21} />
                </View>
                <Text style={styles.accountText}>Help / About LifeFlow</Text>
                <MaterialIcons name="chevron-right" color={COLORS.muted} size={23} />
              </Pressable>
              <View style={styles.accountSeparator} />
              <Pressable
                accessibilityRole="button"
                onPress={confirmLogout}
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.logoutIcon}>
                  <MaterialIcons name="logout" color={COLORS.brand} size={21} />
                </View>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>

          {/* TODO: Profile photo upload will later connect to Laravel storage/backend. */}
        </View>
      </ScrollView>
    </SafeAreaView>
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
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 25 },
  profileHero: { alignItems: 'center' },
  avatarArea: { position: 'relative' },
  avatar: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.white,
    borderRadius: 56,
    backgroundColor: COLORS.softRed,
    shadowColor: '#8B3028',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarInitials: { color: COLORS.brand, fontSize: 35, fontWeight: '800', letterSpacing: -1 },
  cameraButton: {
    position: 'absolute',
    right: -1,
    bottom: 3,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.background,
    borderRadius: 18,
    backgroundColor: COLORS.brand,
  },
  cameraButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.96 }] },
  donorName: { marginTop: 14, color: COLORS.text, fontSize: 24, fontWeight: '800' },
  donorLabel: { marginTop: 4, color: COLORS.muted, fontSize: 13, fontWeight: '600' },
  bloodTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 9,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: COLORS.softRed,
  },
  bloodTypeText: { color: COLORS.brand, fontSize: 13, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    minHeight: 134,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 21,
    backgroundColor: COLORS.softRed,
  },
  statIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  statNumber: { marginTop: 8, color: COLORS.brand, fontSize: 27, fontWeight: '800' },
  statLabel: { marginTop: 2, color: COLORS.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  section: { gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  currentMedalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 18,
    backgroundColor: COLORS.softRed,
  },
  currentMedalIcon: {
    width: 45,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  currentMedalContent: { flex: 1 },
  currentMedalLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  currentMedalTitle: { marginTop: 2, color: COLORS.text, fontSize: 16, fontWeight: '800' },
  achievementList: { gap: 10, paddingRight: 4 },
  achievementCard: {
    width: 145,
    minHeight: 158,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 13,
    borderWidth: 1,
    borderRadius: 19,
  },
  achievementCardLocked: { opacity: 0.62 },
  achievementIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.white,
  },
  achievementTitle: { marginTop: 9, color: COLORS.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  achievementTitleLocked: { color: COLORS.muted },
  achievementRequirement: { marginTop: 4, color: COLORS.muted, fontSize: 10, fontWeight: '600' },
  achievementStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  achievementStatusText: { fontSize: 10, fontWeight: '700' },
  achievementNote: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  informationCard: {
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  informationRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 12,
  },
  informationRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  informationLabel: { flex: 0.9, color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  informationValue: { flex: 1.4, color: COLORS.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  editButton: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  editButtonPressed: { backgroundColor: COLORS.softRed },
  editButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: '800' },
  accountCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  accountRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
  },
  accountRowPressed: { backgroundColor: '#FFF5F2' },
  accountSeparator: { height: 1, marginLeft: 64, backgroundColor: COLORS.border },
  accountIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F5F0ED',
  },
  accountText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  logoutIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  logoutText: { flex: 1, color: COLORS.brand, fontSize: 14, fontWeight: '800' },
});

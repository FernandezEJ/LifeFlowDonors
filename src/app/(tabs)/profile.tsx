import { profileMascotImage } from '@/constants/profile-settings';
import BirthDatePicker from '@/components/birth-date-picker';
import { NotificationBell } from '@/components/notification-bell';
import { type DonationSummary } from '@/services/donations';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { formErrors, toProfileForm, type ProfileForm } from '@/services/auth';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

type Achievement = {
  title: string;
  requiredDonations: number;
  icon: MaterialIconName;
  color: string;
  background: string;
};

// ========================================
// VERIFIED MILESTONE DISPLAY
// The server supplies the current achievement; counts unlock milestone illustrations.
// ========================================
const ACHIEVEMENTS: readonly Achievement[] = [
  { title: 'New Donor', requiredDonations: 0, icon: 'favorite', color: '#A86432', background: '#F5E5D8' },
  { title: 'First-Time Donor', requiredDonations: 1, icon: 'workspace-premium', color: '#A86432', background: '#F5E5D8' },
  { title: 'Bronze Donor', requiredDonations: 3, icon: 'workspace-premium', color: '#A86432', background: '#F5E5D8' },
  { title: 'Silver Donor', requiredDonations: 5, icon: 'workspace-premium', color: '#78838D', background: '#E9EDF0' },
  { title: 'Gold Donor', requiredDonations: 10, icon: 'workspace-premium', color: '#B97700', background: '#FFF1D6' },
];

// ========================================
// PROFILE INFORMATION
// Shows donor details and account email; email stays read-only in profile edits.
// ========================================
const PERSONAL_FIELDS: { label: string; field: keyof ProfileForm }[] = [
  { label: 'First Name', field: 'firstName' }, { label: 'Middle Name', field: 'middleName' },
  { label: 'Last Name', field: 'lastName' }, { label: 'Email', field: 'email' },
  { label: 'Mobile Number', field: 'mobileNumber' }, { label: 'Birth Date', field: 'birthDate' },
  { label: 'Gender', field: 'gender' }, { label: 'Blood Type', field: 'bloodType' },
];

export default function ProfileScreen() {
  const router = useRouter();
  // ========================================
  // REFRESH VERIFIED TOTAL ON FOCUS
  // Errors remain visible and never turn into a fabricated zero or achievement.
  // ========================================
  const { donationSummary } = useAuth();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  useFocusEffect(useCallback(() => {
    let active = true; setSummary(null); setSummaryError('');
    donationSummary().then(data => { if (active) setSummary(data); })
      .catch(e => { if (active) setSummaryError(errorMessage(e)); });
    return () => { active = false; };
  }, [donationSummary]));
  const CURRENT_MEDAL = summary ? ACHIEVEMENTS.find(item => item.title === summary.achievement.label) : null;
  // ========================================
  // PROFILE LOADING AND EDITING
  // Loads Laravel data and keeps unsaved edits separate from displayed data.
  // ========================================
  const { user, profile, loadProfile, saveProfile, logout, busy } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [draft, setDraft] = useState<ProfileForm | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [saved, setSaved] = useState(false);
  const fetching = useRef(false);
  const saving = useRef(false);
  const fullName = user?.name || '';
  const personal = user && profile ? toProfileForm(user, profile) : null;

  useEffect(() => {
    let active = true;
    loadProfile().catch(error => { if (active) setRequestError(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadProfile]);

  const retryProfile = async () => {
    if (fetching.current || loading) return;
    fetching.current = true;
    setLoading(true);
    setRequestError('');
    try { await loadProfile(); } catch (error) { setRequestError(errorMessage(error)); }
    finally { fetching.current = false; setLoading(false); }
  };

  // ========================================
  // SAVE PERSONAL DETAILS
  // Laravel validates the allowed fields; success refreshes the shared profile.
  // ========================================
  const handleSave = async () => {
    if (!draft || busy || saving.current) return;
    saving.current = true;
    setRequestError('');
    setErrors({});
    try { await saveProfile(draft); setDraft(null); setSaved(true); }
    catch (error) { setErrors(formErrors(error)); setRequestError(errorMessage(error)); }
    finally { saving.current = false; }
  };

  // ========================================
  // LOGOUT FEEDBACK
  // The provider revokes the token and clears local state even on network errors.
  // ========================================
  const handleLogout = async () => {
    if (busy) return;
    try {
      const warning = await logout();
      if (warning) Alert.alert('Logout notice', warning);
      router.replace('/(auth)/login');
    } catch (error) { setRequestError(errorMessage(error)); }
  };


  const confirmLogout = () => {
    Alert.alert('Log out?', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => void handleLogout(),
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {/* Shared backend unread count refreshes on focus. */}<NotificationBell />
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.profileHero}>
            <View style={styles.avatarArea}>
              <View accessibilityLabel={`${fullName} profile picture`} style={styles.avatar}>
                <Image source={profileMascotImage(profile?.profile_avatar)} resizeMode="contain" style={{ width: 92, height: 96 }} accessibilityLabel="LifeFlow profile mascot" />
              </View>
              <Pressable
                accessibilityLabel="Change Avatar"
                accessibilityRole="button"
                hitSlop={7}
                onPress={() =>
                  router.push({ pathname: '/profile-settings/[setting]', params: { setting: 'avatar' } })
                }
                style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}>
                <MaterialIcons name="face" color={COLORS.white} size={17} />
              </Pressable>
            </View>
            <Text style={styles.donorName}>{fullName}</Text>
            <Text style={styles.donorLabel}>LifeFlow Donor</Text>
            <View style={styles.bloodTypeBadge}>
              <MaterialIcons name="bloodtype" color={COLORS.brand} size={17} />
              <Text style={styles.bloodTypeText}>{profile?.blood_type || '--'}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <MaterialIcons name="bloodtype" color={COLORS.brand} size={26} />
              </View>
              <Text style={styles.statNumber}>{summary?.total_donations ?? '—'}</Text>
              <Text style={styles.statLabel}>Total Donations</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <MaterialIcons name="workspace-premium" color={COLORS.brand} size={26} />
              </View>
              <Text style={styles.currentMedalTitle}>{summary?.achievement.label ?? '—'}</Text>
              <Text style={styles.statLabel}>Donor Achievement</Text>
            </View>
          </View>

          {summaryError ? <Text accessibilityRole="alert" style={styles.donorLabel}>{summaryError}</Text> : null}

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
                const unlocked = summary !== null && summary.total_donations >= achievement.requiredDonations;

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
            <View style={styles.informationHeading}>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>Profile Information</Text>
              {!draft ? <Pressable accessibilityRole="button" disabled={busy || loading || !personal}
                onPress={() => { setDraft(personal); setErrors({}); setRequestError(''); setSaved(false); }}
                style={({ pressed }) => [styles.editLink, { opacity: busy || loading || !personal ? 0.5 : pressed ? 0.7 : 1 }]}>
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </Pressable> : null}
            </View>
            {loading ? <><ActivityIndicator color={COLORS.brand} /><Text>Loading profile...</Text></> : null}
            {requestError ? <Text accessibilityRole="alert" style={styles.feedbackError}>{requestError}</Text> : null}
            {!loading && requestError && !draft ? <Pressable onPress={retryProfile}><Text style={styles.editButtonText}>Retry profile</Text></Pressable> : null}
            {saved ? <Text accessibilityRole="alert" style={styles.achievementNote}>Profile saved.</Text> : null}
            <View style={styles.informationCard}>
              {PERSONAL_FIELDS.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.informationRow,
                    index < PERSONAL_FIELDS.length - 1 && styles.informationRowBorder,
                  ]}>
                  <Text style={styles.informationLabel}>{item.label}</Text>
                  {item.field === 'email' ? <View style={styles.fieldValue}>
                    <Text selectable style={styles.informationValue}>{personal?.email || '--'}</Text>
                    {user?.email_verified_at ? <Text style={styles.verifiedText}>Verified</Text> : null}
                    {draft ? <Text style={styles.achievementNote}>Change email in Profile Settings.</Text> : null}
                  </View> : draft ? <View style={styles.fieldValue}>
                    {item.field === 'birthDate' ? <BirthDatePicker value={draft.birthDate} disabled={busy}
                      onChange={value => {
                        setDraft(current => current ? { ...current, birthDate: value } : current);
                        setErrors(current => ({ ...current, birthDate: undefined }));
                      }} /> : <TextInput
                      accessibilityLabel={item.label}
                      editable={!busy}
                      autoCapitalize="sentences"
                      keyboardType={item.field === 'mobileNumber' ? 'phone-pad' : 'default'}
                      placeholder={item.field === 'gender' ? 'Male or Female' : item.label}
                      style={[styles.informationValue, styles.editInput]}
                      value={draft[item.field]}
                      onChangeText={value => {
                        setDraft(current => current ? { ...current, [item.field]: value } : current);
                        setErrors(current => ({ ...current, [item.field]: undefined }));
                      }}
                    />}
                    {errors[item.field] ? <Text style={styles.feedbackError}>{errors[item.field]}</Text> : null}
                  </View> : <Text selectable style={styles.informationValue}>{personal?.[item.field] || '--'}</Text>}
                </View>
              ))}
            </View>
            {draft ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void handleSave()}
              style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
              <Text style={styles.editButtonText}>{busy ? 'Saving...' : 'Save Profile'}</Text>
            </Pressable> : null}
            {draft ? <Pressable disabled={busy} style={styles.editButton} onPress={() => { setDraft(null); setErrors({}); setRequestError(''); }}>
              <Text style={styles.editButtonText}>Cancel</Text>
            </Pressable> : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.accountCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push('/profile-settings')
                }
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.accountIcon}>
                  <MaterialIcons name="settings" color={COLORS.text} size={21} />
                </View>
                <Text style={styles.accountText}>Profile Settings</Text>
                <MaterialIcons name="chevron-right" color={COLORS.muted} size={23} />
              </Pressable>
              <View style={styles.accountSeparator} />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push('/help-about')
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
                disabled={busy}
                onPress={confirmLogout}
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.logoutIcon}>
                  <MaterialIcons name="logout" color={COLORS.brand} size={21} />
                </View>
                <Text style={styles.logoutText}>{busy && !draft ? 'Logging out...' : 'Logout'}</Text>
              </Pressable>
            </View>
          </View>


        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ========================================
// PROFILE FORM FEEDBACK
// Adds only the input border and error color needed by existing rows.
// ========================================
const styles = StyleSheet.create({
  editInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, minHeight: 44 },
  feedbackError: { color: COLORS.brand, fontSize: 13 },
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
  informationHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editLink: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end', flexShrink: 0 },
  fieldValue: { gap: 5, width: '100%' },
  verifiedText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  informationRow: {
    minHeight: 58,
    gap: 6,
    paddingVertical: 12,
  },
  informationRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  informationLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  informationValue: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
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

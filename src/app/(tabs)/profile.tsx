import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { LoadError } from '@/components/load-state';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { useTabLeave } from '@/contexts/tab-leave-context';
import { profileMascotImage } from '@/constants/profile-settings';
import BirthDatePicker from '@/components/birth-date-picker';
import { NotificationBell } from '@/components/notification-bell';
import { type DonationSummary } from '@/services/donations';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { BLOOD_TYPES, cleanProfileMobileInput, formErrors, formatDonorName, formatMiddleInitial, profileBirthDate, profileEditErrors, toProfileForm, type ProfileForm } from '@/services/auth';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  brandPressed: PALETTE.primaryPressed,
  text: PALETTE.text,
  muted: PALETTE.neutral,
  border: PALETTE.border,
  white: PALETTE.surface,
  softRed: PALETTE.selected,
  locked: PALETTE.text,
  lockedBackground: PALETTE.inactiveSurface,
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
  { label: 'First Name', field: 'firstName' }, { label: 'Middle Initial (Optional)', field: 'middleName' },
  { label: 'Last Name', field: 'lastName' }, { label: 'Email', field: 'email' },
  { label: 'Mobile Number', field: 'mobileNumber' }, { label: 'Birth Date', field: 'birthDate' },
  { label: 'Gender', field: 'gender' }, { label: 'Blood Type', field: 'bloodType' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));
  const { register, requestLeave } = useTabLeave();
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  // ========================================
  // REFRESH VERIFIED TOTAL ON FOCUS
  // Errors remain visible and never turn into a fabricated zero or achievement.
  // ========================================
  const { donationSummary } = useAuth();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const summaryVersion = useRef(0), summaryRequest = useRef<number | null>(null);
  const loadSummary = useCallback(async () => {
    if (summaryRequest.current === summaryVersion.current) return;
    const version = ++summaryVersion.current; summaryRequest.current = version;
    setSummaryLoading(true); setSummaryError('');
    try { const result = await donationSummary(); if (summaryVersion.current === version) setSummary(result); }
    catch (failure) { if (summaryVersion.current === version) setSummaryError(errorMessage(failure)); }
    finally { if (summaryRequest.current === version) summaryRequest.current = null; if (summaryVersion.current === version) setSummaryLoading(false); }
  }, [donationSummary]);
  useFocusEffect(useCallback(() => {
    void loadSummary();
    return () => { summaryVersion.current++; };
  }, [loadSummary]));
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
  const fullName = formatDonorName(user && profile ? [profile.first_name, formatMiddleInitial(profile.middle_name), profile.last_name].filter(Boolean).join(' ') : user?.name);
  const personal = user && profile ? toProfileForm(user, profile) : null;

  useFocusEffect(useCallback(() => {
    let active = true;
    fetching.current = true; setLoading(true);
    loadProfile().then(() => { if (active) setRequestError(''); }).catch(error => { if (active) setRequestError(errorMessage(error)); })
      .finally(() => { if (active) { fetching.current = false; setLoading(false); } });
    return () => { active = false; fetching.current = false; };
  }, [loadProfile]));

  const draftRef = useRef(draft);
  const personalRef = useRef(personal);
  useEffect(() => { draftRef.current = draft; personalRef.current = personal; }, [draft, personal]);
  useFocusEffect(useCallback(() => {
    const guard = (leave: () => void) => {
      if (saving.current) return;
      const edited = draftRef.current;
      const saved = personalRef.current;
      if (edited && saved && Object.keys(edited).some(key => edited[key as keyof ProfileForm] !== saved[key as keyof ProfileForm])) {
        setPendingLeave(() => leave);
      } else { setDraft(null); setErrors({}); leave(); }
    };
    const unregister = register(guard);
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!draftRef.current) return false;
      guard(() => { if (router.canGoBack()) router.back(); else BackHandler.exitApp(); });
      return true;
    });
    return () => { back.remove(); unregister(); setDraft(null); setErrors({}); setPendingLeave(null); };
  }, [register, router]));

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
    const validation = profileEditErrors(draft);
    if (Object.keys(validation).length) { setErrors(validation); setRequestError(''); return; }
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

  const [logoutConfirmation,setLogoutConfirmation]=useState(false);
  const confirmLogout = () => setLogoutConfirmation(true);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {/* Shared backend unread count refreshes on focus. */}<NotificationBell beforeOpen={requestLeave} />
        </View>
      </View>

      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {loading && !profile ? <TabSkeleton variant="profile" label="Loading donor profile" /> :
          <View style={styles.profileHero}>
            <View style={styles.avatarArea}>
              <View accessibilityLabel={`${fullName} profile picture`} style={styles.avatar}>
                <Image fadeDuration={0} source={profileMascotImage(profile?.profile_avatar)} resizeMode="contain" style={{ width: 92, height: 92 }} accessibilityLabel="LifeFlow profile mascot" />
              </View>
              <Pressable
                accessibilityLabel="Change Avatar"
                accessibilityRole="button"
                hitSlop={7}
                onPress={() =>
                  requestLeave(() => router.push({ pathname: '/profile-settings/[setting]', params: { setting: 'avatar' } }))
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

          }
          {!summary && summaryLoading ? <TabSkeleton variant="profile-summary" label="Loading donor summary" /> : <View style={styles.statsRow}>
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

          }
          {summaryError ? <LoadError message={summaryError} subject="donor summary" retryLabel="Retry donor summary" loading={summaryLoading} onRetry={() => void loadSummary()} /> : null}

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
                    <Text style={[styles.achievementRequirement,!unlocked && {color:PALETTE.text}]}>
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
                          { color: unlocked ? PALETTE.neutralText : COLORS.locked },
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
                onPress={() => { setDraft(personal ? { ...personal, mobileNumber: cleanProfileMobileInput(personal.mobileNumber) } : null); setErrors({}); setRequestError(''); setSaved(false); }}
                style={({ pressed }) => [styles.editLink, { opacity: busy || loading || !personal ? 0.5 : pressed ? 0.7 : 1 }]}>
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </Pressable> : null}
            </View>
            {loading && personal ? <ActivityIndicator color={COLORS.brand} accessibilityLabel="Refreshing profile" /> : null}
            {requestError && !draft ? <LoadError message={requestError} subject="profile" retryLabel="Retry profile" loading={loading} onRetry={() => void retryProfile()} /> : requestError ? <Text accessibilityRole="alert" style={styles.feedbackError}>{requestError}</Text> : null}
            {saved ? <Text accessibilityRole="alert" style={styles.achievementNote}>Profile saved.</Text> : null}
            {loading && !personal ? <TabSkeleton variant="profile-fields" label="Loading profile information" /> : <View style={styles.informationCard}>
              {PERSONAL_FIELDS.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.informationRow,
                    index < PERSONAL_FIELDS.length - 1 && styles.informationRowBorder,
                  ]}>
                  <Text style={styles.informationLabel}>{item.label}</Text>
                  {item.field === 'email' ? <View style={styles.fieldValue}>
                    <Text selectable style={[styles.informationValue, styles.emailValue]}
                      accessibilityLabel={personal?.email ? `${personal.email}${user?.email_verified_at ? ', verified email' : ''}` : 'Email not available'}>
                      {personal?.email || '--'}
                      {personal?.email && user?.email_verified_at ? <Text style={styles.verifiedText}>{' '}
                        <MaterialIcons name="check-circle" size={14} color={PALETTE.success} accessible={false} />{' Verified'}</Text> : null}
                    </Text>
                    {draft ? <Text style={styles.achievementNote}>Change email in Profile Settings.</Text> : null}
                  </View> : draft ? <View style={styles.fieldValue}>
                    {item.field === 'birthDate' ? <BirthDatePicker value={draft.birthDate} disabled={busy}
                      onChange={value => {
                        setDraft(current => current ? { ...current, birthDate: value } : current);
                        setErrors(current => ({ ...current, birthDate: undefined }));
                      }} /> : item.field === 'bloodType' ? <View style={styles.bloodTypeOptions}>
                        {BLOOD_TYPES.map(bloodType => {
                          const selected = draft.bloodType === bloodType;
                          return <Pressable key={bloodType} accessibilityRole="radio" accessibilityLabel={bloodType}
                            accessibilityState={{ selected, disabled: busy }} disabled={busy}
                            onPress={() => {
                              setDraft(current => current ? { ...current, bloodType } : current);
                              setErrors(current => ({ ...current, bloodType: undefined }));
                            }} style={[styles.bloodTypeChip, selected && styles.bloodTypeSelected, errors.bloodType && styles.selectionError]}>
                            <Text style={[styles.bloodTypeTextOption, selected && styles.bloodTypeTextSelected]}>{bloodType}</Text>
                          </Pressable>;
                        })}
                      </View> : <TextInput
                      accessibilityLabel={item.label}
                      editable={!busy}
                      autoCapitalize={item.field === 'middleName' ? 'characters' : 'sentences'}
                      maxLength={item.field === 'mobileNumber' ? 11 : item.field === 'middleName' ? 1 : undefined}
                      keyboardType={item.field === 'mobileNumber' ? 'phone-pad' : 'default'}
                      placeholder={item.field === 'mobileNumber' ? '09XXXXXXXXX' : item.field === 'gender' ? 'Male or Female' : item.label}
                      style={[styles.informationValue, styles.editInput]}
                      value={draft[item.field]}
                      onChangeText={value => {
                        setDraft(current => current ? { ...current, [item.field]: item.field === 'middleName' ? value.toUpperCase() : item.field === 'mobileNumber' ? cleanProfileMobileInput(value) : value } : current);
                        setErrors(current => ({ ...current, [item.field]: undefined }));
                      }}
                    />}
                    {item.field === 'mobileNumber' ? <Text style={styles.achievementNote}>Enter an 11-digit mobile number starting with 09.</Text> : null}
                    {errors[item.field] ? <Text style={styles.feedbackError}>{errors[item.field]}</Text> : null}
                  </View> : <Text selectable style={styles.informationValue}>{(item.field === 'middleName' ? formatMiddleInitial(personal?.middleName) : item.field === 'birthDate' ? profileBirthDate(personal?.birthDate) : personal?.[item.field]) || '--'}</Text>}
                </View>
              ))}
            </View>
            }
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
                  requestLeave(() => router.push('/profile-settings'))
                }
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.accountIcon}>
                  <MaterialIcons name="settings" color={PALETTE.primary} size={21} />
                </View>
                <Text style={styles.accountText}>Profile Settings</Text>
                <MaterialIcons name="chevron-right" color={PALETTE.primary} size={22} />
              </Pressable>
              <View style={styles.accountSeparator} />
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  requestLeave(() => router.push('/help-about'))
                }
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}>
                <View style={styles.accountIcon}>
                  <MaterialIcons name="help-outline" color={PALETTE.primary} size={21} />
                </View>
                <Text style={styles.accountText}>About LifeFlow</Text>
                <MaterialIcons name="chevron-right" color={PALETTE.primary} size={22} />
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
      <ConfirmationModal visible={!!pendingLeave} icon="delete-outline" variant="destructive" title="Discard changes?" message="You have unsaved changes. Do you want to discard them?" secondaryLabel="Stay" primaryLabel="Discard" onSecondary={() => setPendingLeave(null)} onPrimary={() => { const leave = pendingLeave; setDraft(null); draftRef.current = null; setErrors({}); setRequestError(''); setPendingLeave(null); leave?.(); }} />
      <ConfirmationModal visible={logoutConfirmation} icon="logout" variant="destructive" title="Log out?" message="Are you sure you want to log out?" secondaryLabel="Cancel" primaryLabel="Logout" dismissible={false} loading={busy} onSecondary={()=>setLogoutConfirmation(false)} onPrimary={()=>{setLogoutConfirmation(false);return handleLogout();}} />
    </SafeAreaView>
  );
}

// ========================================
// PROFILE FORM FEEDBACK
// Adds only the input border and error color needed by existing rows.
// ========================================
const styles = StyleSheet.create({
  editInput: { borderWidth: 1, borderColor: PALETTE.controlBorder, borderRadius: 8, padding: 8, minHeight: 44 },
  feedbackError: { color: PALETTE.danger, fontSize: 13 },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  fixedHeader: {
    zIndex: 10,
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
  headerTitle: { color: PALETTE.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
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
  avatarArea: { position: 'relative', width: 112, height: 112 },
  avatar: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 56,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  avatarInitials: { color: COLORS.brand, fontSize: 35, fontWeight: '800', letterSpacing: -1 },
  cameraButton: {
    position: 'absolute',
    zIndex: 1,
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
    borderColor: PALETTE.border,
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
    borderColor: PALETTE.border,
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
  currentMedalLabel: { color: PALETTE.neutralText, fontSize: 11, fontWeight: '600' },
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
  achievementTitleLocked: { color: PALETTE.text },
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
  emailValue: { lineHeight: 22 },
  verifiedText: { color: PALETTE.success, fontSize: 11, fontWeight: '700' },
  bloodTypeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bloodTypeChip: { minHeight: 46, minWidth: 68, flexGrow: 1, flexBasis: '21%', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: PALETTE.controlBorder, borderRadius: 14, backgroundColor: COLORS.white },
  bloodTypeSelected: { borderColor: COLORS.brand, backgroundColor: COLORS.softRed },
  selectionError: { borderColor: PALETTE.danger },
  bloodTypeTextOption: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  bloodTypeTextSelected: { color: COLORS.brand, fontWeight: '800' },
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
  accountRowPressed: { backgroundColor: PALETTE.selected },
  accountSeparator: { height: 1, marginLeft: 64, backgroundColor: COLORS.border },
  accountIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: PALETTE.neutralSurface,
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

import { requestFlowieChat, type FlowieHistoryEntry } from '@/services/flowie-chat';
import type { ProofUpload } from '@/services/proof-storage';
import type { ProfileMascotKey } from '@/constants/profile-settings';
import { rewardsApi, type PointSummary, type PointTransaction, type Voucher, type VoucherStatus, type Page, type Catalogue, type RedemptionResponse, type VoucherResponse } from '@/services/rewards';
import { notificationApi, type HomeReminders, type NotificationPage, type ImportantNotification } from '@/services/notifications';
import { donationApi, type DonationOpportunity, type DonationParticipation, type DonationPage, type DonationSummary, type DonationStatus } from '@/services/donations';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, errorMessage } from '@/services/api';
import { authApi, type AuthResponse, type PendingRegistration, type DonorProfile, type ProfileForm, type RegisterForm, type User } from '@/services/auth';
import { eligibilityApi, type EligibilityState, type EligibilityAnswers, type EligibilityAssessment } from '@/services/eligibility';
import { tokenStorage } from '@/services/token-storage';

// ========================================
// SHARED SESSION STATE
// One provider owns the user, profile, and token for every screen.
// The token stays private to this provider and storage.
// ========================================
type AuthContextValue = {
  flowieChat: (message: string, history: FlowieHistoryEntry[]) => Promise<{ reply: string }>;
  user: User | null; profile: DonorProfile | null; restoring: boolean; sessionError: string;
  busy: boolean; restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (form: RegisterForm) => Promise<PendingRegistration>;
  verifyRegistration: (pendingToken: string, code: string) => Promise<void>;
  requestEmailChange: (password: string, email: string) => Promise<PendingRegistration>;
  resendEmailChange: (pendingToken: string) => Promise<{resend_after: number; expires_in: number}>;
  verifyEmailChange: (pendingToken: string, code: string) => Promise<void>;
  changePassword: (current: string, password: string, confirmation: string) => Promise<void>;
  saveAvatar: (avatar: ProfileMascotKey) => Promise<void>;
  loadProfile: () => Promise<void>; saveProfile: (form: ProfileForm) => Promise<void>;
  submitAssessment: (answers: EligibilityAnswers) => Promise<EligibilityAssessment>;
  eligibilityState: () => Promise<EligibilityState>;
  latestAssessment: () => Promise<EligibilityAssessment | null>;
  donationHistory: (page?: number, status?: DonationStatus) => Promise<DonationPage>;
  donationSummary: () => Promise<DonationSummary>;
  donationDetail: (id: string) => Promise<{ participation: DonationParticipation }>;
  opportunities: () => Promise<{data:DonationOpportunity[]}>;
  opportunity: (id:string) => Promise<{opportunity:DonationOpportunity}>;
  joinOpportunity: (id:string) => Promise<{participation:DonationParticipation}>;
  cancelParticipation: (id:string) => Promise<{participation:DonationParticipation}>;
  submitProof: (id:string,file:ProofUpload) => Promise<{participation:DonationParticipation}>;
  // ========================================
  // PRIVATE NOTIFICATION AND DEVICE ACTIONS
  // The bearer token stays inside this provider.
  // ========================================
  homeReminders: () => Promise<HomeReminders>;
  listNotifications: (page?: number, unread?: boolean) => Promise<NotificationPage>;
  notificationCount: () => Promise<{unread_count: number}>;
  readNotification: (id: number) => Promise<{notification: ImportantNotification}>;
  readAllNotifications: () => Promise<{unread_count: number}>;
  registerDeviceToken: (deviceToken: string) => Promise<{registered: boolean}>;
  unregisterDeviceToken: (deviceToken: string) => Promise<{removed: boolean}>;
  // Protected rewards calls share the same stale-session and logout safeguards.
  pointsSummary: () => Promise<PointSummary>;
  pointTransactions: (page?: number, type?: PointTransaction['type']) => Promise<Page<PointTransaction>>;
  rewards: () => Promise<Catalogue>;
  redeemReward: (id: number, key: string) => Promise<RedemptionResponse>;
  vouchers: (page?: number, status?: VoucherStatus) => Promise<Page<Voucher> & {server_time: string}>;
  voucher: (id: number) => Promise<VoucherResponse>;
  activateVoucher: (id: number) => Promise<VoucherResponse>;
  logout: () => Promise<string | undefined>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = useRef<string | null>(null);
  const mutation = useRef(false);
  const profileVersion = useRef(0);
  const cleanupPending = useRef(false);

  // ========================================
  // LOCAL CLEANUP AND RESTORATION
  // Rejects revoked sessions. Temporary network failures keep the saved
  // token for retry and do not reveal protected screens before validation.
  // ========================================
  const clearSession = useCallback(async () => {
    token.current = null;
    setUser(null);
    setProfile(null);
    cleanupPending.current = true;
    try { await tokenStorage.remove(); cleanupPending.current = false; }
    catch { throw new ApiError('Signed out, but device storage could not be cleared. Please retry before restarting the app.'); }
  }, []);

  const restore = useCallback(async () => {
    try {
      const saved = await tokenStorage.get();
      setSessionError('');
      if (cleanupPending.current) { await clearSession(); return; }
      if (saved) {
        const current = await authApi.currentUser(saved);
        token.current = saved;
        setUser(current);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try { await clearSession(); } catch (cleanupError) { setSessionError(errorMessage(cleanupError)); }
      } else {
        setSessionError(error instanceof ApiError ? error.message : 'Cannot read the saved session. Please retry.');
      }
    } finally { setRestoring(false); }
  }, [clearSession]);
  useEffect(() => {
    // Restoration updates state only after asynchronous device storage/API work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);

  // ========================================
  // ACCOUNT MUTATIONS
  // A synchronous lock prevents duplicate submissions, including rapid taps.
  // Save the token successfully before allowing authenticated navigation.
  // ========================================
  async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (mutation.current) throw new ApiError('Please wait for the current request to finish.');
    mutation.current = true;
    setBusy(true);
    try { return await operation(); }
    finally { mutation.current = false; setBusy(false); }
  }
  async function acceptSession(response: AuthResponse) {
    if (!response.token || !response.user?.id) throw new ApiError('The server returned an incomplete session. Please log in again.');
    try { await tokenStorage.save(response.token); }
    catch {
      await authApi.logout(response.token).catch(() => undefined);
      throw new ApiError('Could not securely save the session. Your account may already exist; please try logging in.');
    }
    token.current = response.token;
    setUser(response.user);
    setProfile(response.donor_profile || null);
  }

  // ========================================
  // PROTECTED PROFILE REQUESTS
  // Ignores responses belonging to a session that has since signed out.
  // A rejected bearer token clears both user and profile state.
  // ========================================
  const profileRequest = useCallback(async (form?: ProfileForm) => {
    const version = profileVersion.current;
    const saved = token.current;
    if (!saved) throw new ApiError('Please log in again.', 401);
    try {
      const response = form ? await authApi.updateProfile(saved, form) : await authApi.profile(saved);
      if (token.current === saved && profileVersion.current === version) {
        setUser(response.user);
        setProfile(response.donor_profile);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && token.current === saved) {
        try { await clearSession(); } catch (cleanupError) { setSessionError(errorMessage(cleanupError)); }
      }
      throw error;
    }
  }, [clearSession]);
  const loadProfile = useCallback(() => profileRequest(), [profileRequest]);

  // ========================================
  // PRE-SCREENING REQUESTS
  // Rejects responses from a signed-out session and clears revoked credentials.
  // ========================================
  const assessmentRequest = useCallback(async (answers?: EligibilityAnswers) => {
    const saved = token.current;
    if (!saved) throw new ApiError('Please log in again.', 401);
    try {
      const response = answers ? await eligibilityApi.submit(saved, answers) : await eligibilityApi.latest(saved);
      if (token.current !== saved) throw new ApiError('Your session changed. Please try again.', 401);
      return response.assessment;
    } catch (error) {
      // A cooldown conflict can contain private history; discard it after logout.
      if (token.current !== saved) throw new ApiError('Your session changed. Please try again.', 401);
      if (error instanceof ApiError && error.status === 401 && token.current === saved) {
        try { await clearSession(); } catch (cleanupError) { setSessionError(errorMessage(cleanupError)); }
      }
      throw error;
    }
  }, [clearSession]);
  // ========================================
  // PRIVATE DONATION REQUESTS
  // Ignores signed-out sessions and clears expired credentials using existing cleanup.
  // ========================================
  const donationRequest = useCallback(async <T,>(operation: (saved: string) => Promise<T>): Promise<T> => {
    const saved = token.current;
    if (!saved) throw new ApiError('Please log in again.', 401);
    try {
      const response = await operation(saved);
      if (saved !== token.current) throw new ApiError('Your session changed. Please try again.', 401);
      return response;
    } catch (error) {
      if (saved !== token.current) throw new ApiError('Your session changed. Please try again.', 401);
      if (error instanceof ApiError && error.status === 401 && saved === token.current) {
        try { await clearSession(); } catch (cleanupError) { setSessionError(errorMessage(cleanupError)); }
      }
      throw error;
    }
  }, [clearSession]);
  const flowieChat = useCallback((message: string, history: FlowieHistoryEntry[]) => donationRequest(saved => requestFlowieChat(saved, message, history)), [donationRequest]);
  const donationHistory = useCallback((page = 1, status?: DonationStatus) => donationRequest(saved => donationApi.history(saved, page, status)), [donationRequest]);
  const donationSummary = useCallback(() => donationRequest(donationApi.summary), [donationRequest]);
  const donationDetail = useCallback((id: string) => donationRequest(saved => donationApi.detail(saved, id)), [donationRequest]);
  // ========================================
  // OPPORTUNITY PARTICIPATION ACTIONS
  // All actions reuse the existing private token and expired-session handling.
  // ========================================
  const opportunities=useCallback(()=>donationRequest(donationApi.opportunities),[donationRequest]);
  const opportunity=useCallback((id:string)=>donationRequest(saved=>donationApi.opportunity(saved,id)),[donationRequest]);
  const joinOpportunity=useCallback((id:string)=>donationRequest(saved=>donationApi.join(saved,id)),[donationRequest]);
  const cancelParticipation=useCallback((id:string)=>donationRequest(saved=>donationApi.cancel(saved,id)),[donationRequest]);
  const submitProof=useCallback((id:string,file:ProofUpload)=>donationRequest(saved=>donationApi.proof(saved,id,file)),[donationRequest]);

  // ========================================
  // NOTIFICATION API SESSION SAFETY
  // Reuses the existing protected request wrapper and stale-session guard.
  // Logout's Sanctum deletion cascades only this login's device registration.
  // ========================================
  const homeReminders = useCallback(() => donationRequest(notificationApi.reminders), [donationRequest]);
  const listNotifications = useCallback((page = 1, unread = false) => donationRequest(saved => notificationApi.list(saved, page, unread)), [donationRequest]);
  const notificationCount = useCallback(() => donationRequest(notificationApi.count), [donationRequest]);
  const readNotification = useCallback((id: number) => donationRequest(saved => notificationApi.read(saved, id)), [donationRequest]);
  const readAllNotifications = useCallback(() => donationRequest(notificationApi.readAll), [donationRequest]);
  const registerDeviceToken = useCallback((deviceToken: string) => donationRequest(saved => notificationApi.register(saved, deviceToken)), [donationRequest]);
  const unregisterDeviceToken = useCallback((deviceToken: string) => donationRequest(saved => notificationApi.unregister(saved, deviceToken)), [donationRequest]);

  // ========================================
  // PRIVATE POINTS AND VOUCHER REQUESTS
  // Screens never receive the Sanctum token or select an account.
  // ========================================
  const pointsSummary = useCallback(() => donationRequest(rewardsApi.summary), [donationRequest]);
  const pointTransactions = useCallback((page = 1, type?: PointTransaction['type']) => donationRequest(saved => rewardsApi.transactions(saved, page, type)), [donationRequest]);
  const rewards = useCallback(() => donationRequest(rewardsApi.rewards), [donationRequest]);
  const redeemReward = useCallback((id: number, key: string) => donationRequest(saved => rewardsApi.redeem(saved, id, key)), [donationRequest]);
  const vouchers = useCallback((page = 1, status?: VoucherStatus) => donationRequest(saved => rewardsApi.vouchers(saved, page, status)), [donationRequest]);
  const voucher = useCallback((id: number) => donationRequest(saved => rewardsApi.voucher(saved, id)), [donationRequest]);
  const activateVoucher = useCallback((id: number) => donationRequest(saved => rewardsApi.activate(saved, id)), [donationRequest]);

  // Cooldown metadata shares the private token and stale-session safeguards.
  const eligibilityState = useCallback(() => donationRequest(eligibilityApi.latest), [donationRequest]);
  const latestAssessment = useCallback(() => assessmentRequest(), [assessmentRequest]);
  const submitAssessment = async (answers: EligibilityAnswers) => {
    const assessment = await assessmentRequest(answers);
    if (!assessment) throw new ApiError('The server did not return a saved assessment.');
    return assessment;
  };


  // ========================================
  // LOGOUT
  // Attempts server revocation first, then always clears this device.
  // Returns a safe warning when server revocation could not be confirmed.
  // ========================================
  const logout = () => exclusive(async () => {
    let warning: string | undefined;
    try { if (token.current) await authApi.logout(token.current); }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) warning = 'Signed out on this device. Server logout could not be confirmed because the request failed.';
    } finally {
      try { await clearSession(); }
      catch (error) { warning = errorMessage(error); setSessionError(warning); }
    }
    return warning;
  });

  return <AuthContext.Provider value={{ homeReminders, flowieChat, pointsSummary, pointTransactions, rewards, redeemReward, vouchers, voucher, activateVoucher, listNotifications, notificationCount, readNotification, readAllNotifications, registerDeviceToken, unregisterDeviceToken, user, profile, restoring, sessionError, busy,
    restore: async () => { setRestoring(true); await restore(); },
    login: (email, password) => exclusive(async () => acceptSession(await authApi.login(email, password))),
    register: (form) => exclusive(() => authApi.register(form)),
    verifyRegistration: (pendingToken, code) => exclusive(async () => acceptSession(await authApi.verifyRegistration(pendingToken, code))),
    eligibilityState, latestAssessment, submitAssessment, donationHistory, donationSummary, donationDetail, opportunities, opportunity, joinOpportunity, cancelParticipation, submitProof,
    requestEmailChange: (password, email) => exclusive(() => donationRequest(saved => authApi.requestEmailChange(saved, password, email))),
    resendEmailChange: pending => exclusive(() => donationRequest(saved => authApi.resendEmailChange(saved, pending))),
    verifyEmailChange: (pending, code) => exclusive(async () => {
      const response = await donationRequest(saved => authApi.verifyEmailChange(saved, pending, code));
      profileVersion.current++; setUser(response.user);
    }),
    changePassword: (current, password, confirmation) => exclusive(async () => { await donationRequest(saved => authApi.changePassword(saved, current, password, confirmation)); }),
    saveAvatar: avatar => exclusive(async () => {
      const response = await donationRequest(saved => authApi.saveAvatar(saved, avatar));
      profileVersion.current++; setUser(response.user); setProfile(response.donor_profile);
    }),
    loadProfile, saveProfile: (form) => exclusive(() => profileRequest(form)), logout,
  }}>{children}</AuthContext.Provider>;
}

// ========================================
// SCREEN ACCESS
// Ensures every consumer uses the root provider rather than duplicate state.
// ========================================
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

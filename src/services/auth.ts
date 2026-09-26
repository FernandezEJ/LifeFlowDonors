import type { ProfileMascotKey } from '@/constants/profile-settings';
import { ApiError, apiRequest } from './api';

// ========================================
// ACCOUNT AND FORM TYPES
// Shares the Laravel contract across registration and profile editing.
// ========================================
export type User = { id: number; name: string; email: string; email_verified_at?: string | null };
export type DonorProfile = {
  profile_avatar?: string | null;
  first_name: string; middle_name: string | null; last_name: string;
  mobile_number: string; birth_date: string; gender: string; blood_type: string;
};
export type ProfileResponse = { user: User; donor_profile: DonorProfile };
export type PendingRegistration = { pending_token: string; resend_after: number; expires_in: number };
export type AuthResponse = { user: User; token: string; donor_profile?: DonorProfile };
export type ProfileForm = {
  firstName: string; middleName: string; lastName: string; email: string;
  mobileNumber: string; birthDate: string; gender: string; bloodType: string;
};
export type RegisterForm = ProfileForm & { password: string; confirmPassword: string; acceptedTerms: boolean; acknowledgedPrivacy: boolean; acknowledgedPrescreening: boolean };
export const FIELD_MAPPING = {
  firstName: 'first_name', middleName: 'middle_name', lastName: 'last_name', email: 'email',
  mobileNumber: 'mobile_number', birthDate: 'birth_date', gender: 'gender', bloodType: 'blood_type',
  password: 'password', confirmPassword: 'password_confirmation',
  acceptedTerms: 'accepted_terms', acknowledgedPrivacy: 'acknowledged_privacy', acknowledgedPrescreening: 'acknowledged_prescreening',
} as const;

// ========================================
// DATE AND FIELD CONVERSION
// Keeps MM/DD/YYYY visible and rejects impossible dates without timezone shifts.
// Only explicitly allowed fields can be sent to Laravel.
// ========================================
export function toApiDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const [month, day, year] = match ? match.slice(1).map(Number) : [0, 0, 0];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new ApiError('Enter a valid birth date in MM/DD/YYYY format.', 422, { birth_date: ['Enter a valid birth date in MM/DD/YYYY format.'] });
  }
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function toProfileUpdatePayload(form: ProfileForm) {
  return {
    first_name: form.firstName.trim(), middle_name: form.middleName.trim() || null,
    last_name: form.lastName.trim(), mobile_number: form.mobileNumber.trim(),
    birth_date: toApiDate(form.birthDate), gender: form.gender, blood_type: form.bloodType,
  };
}

export function toProfilePayload(form: ProfileForm) {
  return { ...toProfileUpdatePayload(form), email: form.email.trim() };
}

export function toProfileForm(user: User, profile: DonorProfile): ProfileForm {
  const [year, month, day] = profile.birth_date.slice(0, 10).split('-');
  return {
    firstName: profile.first_name, middleName: profile.middle_name || '', lastName: profile.last_name,
    email: user.email, mobileNumber: profile.mobile_number, birthDate: `${month}/${day}/${year}`,
    gender: profile.gender, bloodType: profile.blood_type,
  };
}

export function formErrors(error: unknown): Partial<Record<keyof RegisterForm, string>> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(Object.entries(FIELD_MAPPING).flatMap(([field, backend]) =>
    error.fields[backend]?.length ? [[field, error.fields[backend].join('\n')]] : []));
}

// ========================================
// LARAVEL ACCOUNT ENDPOINTS
// Registration already creates the donor profile; no extra creation call is needed.
// ========================================
export const authApi = {
  register: (form: RegisterForm) => apiRequest<PendingRegistration>('/register/request-verification', { method: 'POST', body: {
    ...toProfilePayload(form), password: form.password, password_confirmation: form.confirmPassword,
    accepted_terms: form.acceptedTerms, acknowledged_privacy: form.acknowledgedPrivacy, acknowledged_prescreening: form.acknowledgedPrescreening,
  } }),
  verifyRegistration: (pendingToken: string, code: string) => apiRequest<AuthResponse>('/register/verify-email', { method: 'POST', body: { pending_token: pendingToken, code } }),
  resendRegistration: (pendingToken: string) => apiRequest<{resend_after: number; expires_in: number}>('/register/resend-verification', { method: 'POST', body: { pending_token: pendingToken } }),
  login: (email: string, password: string) => apiRequest<AuthResponse>('/login', { method: 'POST', body: { email: email.trim(), password } }),
  currentUser: (token: string) => apiRequest<User>('/user', { token }),
  profile: (token: string) => apiRequest<ProfileResponse>('/donor-profile', { token }),
  saveAvatar: (token: string, avatar: ProfileMascotKey) => apiRequest<ProfileResponse>('/donor-profile/avatar', { method: 'PUT', token, body: { profile_avatar: avatar } }),
  updateProfile: (token: string, form: ProfileForm) => apiRequest<ProfileResponse>('/donor-profile', { method: 'PUT', token, body: toProfileUpdatePayload(form) }),
  requestEmailChange: (token: string, currentPassword: string, newEmail: string) => apiRequest<PendingRegistration>('/profile/change-email/request', { method: 'POST', token, body: { current_password: currentPassword, new_email: newEmail.trim().toLowerCase() } }),
  resendEmailChange: (token: string, pendingToken: string) => apiRequest<{resend_after: number; expires_in: number}>('/profile/change-email/resend', { method: 'POST', token, body: { pending_token: pendingToken } }),
  verifyEmailChange: (token: string, pendingToken: string, code: string) => apiRequest<{user: User; message: string}>('/profile/change-email/verify', { method: 'POST', token, body: { pending_token: pendingToken, code } }),
  changePassword: (token: string, currentPassword: string, password: string, confirmation: string) => apiRequest<{message: string}>('/profile/change-password', { method: 'POST', token, body: { current_password: currentPassword, password, password_confirmation: confirmation } }),
  logout: (token: string) => apiRequest<{ message: string }>('/logout', { method: 'POST', token }),
};

import { apiRequest } from './api';

// Public recovery calls never attach a saved Sanctum token or persist secrets.
export const RESET_NOTICE = 'If an account is registered with this email, password reset instructions will be sent shortly.';
export const passwordResetApi = {
  request: (email: string) => apiRequest<{message: string; resend_after: number}>('/forgot-password/request', {
    method: 'POST', body: { email: email.trim() },
  }),
  verify: (email: string, code: string) => apiRequest<{reset_token: string; expires_in: number}>('/forgot-password/verify', {
    method: 'POST', body: { email: email.trim(), code },
  }),
  reset: (email: string, resetToken: string, password: string, confirmation: string) => apiRequest<{message: string}>('/forgot-password/reset', {
    method: 'POST', body: { email: email.trim(), reset_token: resetToken, password, password_confirmation: confirmation },
  }),
};

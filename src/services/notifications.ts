import { apiRequest } from './api';
import type { AnnouncementDetail } from './donations';

// ========================================
// IMPORTANT NOTIFICATION CONTRACT AND OWNED API
// Navigation metadata contains IDs only; no token or private donor details.
// ========================================
export type ImportantNotification = {
  id: number; type: 'admin_announcement' | 'donation_completed' | 'donation_rejected' | 'donation_needs_revision' | 'donation_reminder' | 'donation_cooldown_complete';
  title: string; message: string; data: { opportunity_id?: number | null; participation_id?: number | null; event_date?: string; reminder_date?: string; last_completed_donation_at?: string; next_eligible_donation_at?: string } | null;
  read_at: string | null; created_at: string;
};
export type NotificationPage = { data: ImportantNotification[]; current_page: number; last_page: number; total: number };
export type HomeReminder = { notification: ImportantNotification; activity_title: string; event_date: string; start_time: string | null; remaining_seconds: number };
export type HomeReminders = { reminders: HomeReminder[]; server_time: string };
export const notificationApi = {
  announcement: (token: string, id: number) => apiRequest<AnnouncementDetail>('/notifications/'+id+'/announcement', { token }),
  reminders: (token: string) => apiRequest<HomeReminders>('/notifications/reminders', { token }),
  preparation: (token: string, id: number) => apiRequest<{reminder: HomeReminder}>('/notifications/'+id+'/preparation', { token }),
  acknowledgePreparation: (token: string, id: number) => apiRequest<{acknowledged: boolean}>('/notifications/'+id+'/preparation-acknowledgement', { token, method: 'POST' }),
  list: (token: string, page = 1, unread = false) => apiRequest<NotificationPage>('/notifications?page='+page+'&unread='+(unread?'1':'0'), { token }),
  count: (token: string) => apiRequest<{unread_count: number}>('/notifications/unread-count', { token }),
  read: (token: string, id: number) => apiRequest<{notification: ImportantNotification}>('/notifications/'+id+'/read', { token, method: 'POST' }),
  readAll: (token: string) => apiRequest<{unread_count: number}>('/notifications/read-all', { token, method: 'POST' }),
  register: (token: string, deviceToken: string) => apiRequest<{registered: boolean}>('/device-tokens', { token, method: 'POST', body: { token: deviceToken, platform: 'android', provider: 'fcm' } }),
  unregister: (token: string, deviceToken: string) => apiRequest<{removed: boolean}>('/device-tokens/unregister', { token, method: 'POST', body: { token: deviceToken } }),
};

// ========================================
// VALIDATED AUTHENTICATED DESTINATIONS
// Never accept arbitrary URLs from a push; callers first resolve its ID
// against the owned notification API and use the server's returned record.
// ========================================
export function notificationDestination(item: ImportantNotification) {
  if (item.type === 'donation_cooldown_complete') return { pathname: '/(tabs)/status' as const };
  const id = item.type === 'admin_announcement' ? item.data?.opportunity_id : item.data?.participation_id;
  if (!Number.isSafeInteger(id) || !id || id < 1) return null;
  if (item.type === 'admin_announcement') return Number.isSafeInteger(item.id) && item.id > 0
    ? { pathname: '/announcement/[id]' as const, params: { id: String(id), notificationId: String(item.id) } } : null;
  if (item.type === 'donation_reminder') return Number.isSafeInteger(item.id) && item.id > 0
    ? { pathname: '/donation-preparation' as const, params: { id: String(item.id) } } : null;
  if (item.type === 'donation_completed' || item.type === 'donation_rejected' || item.type === 'donation_needs_revision') return { pathname: '/activity/[id]' as const, params: { id: String(id) } };
  return null;
}

// Presentation only; server timestamps and read state remain authoritative.
export function preparationQuestion(title: string, date: string): string {
  const safeTitle = title.replace(/[\r\n\x00-\x1f]/g, ' ').trim().slice(0, 180);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00') : null;
  const label = parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'my upcoming donation';
  return `I'm donating blood at ${safeTitle || 'my joined activity'} on ${label}. How should I prepare? I understand healthcare staff decide final eligibility.`;
}

export function notificationTimeLabel(value: unknown, now = Date.now()): string {
  const time = typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || !Number.isFinite(now)) return 'Date unavailable';
  const date = new Date(time), today = new Date(now);
  const age = Math.max(0, now - time);
  if (time <= now + 60000) {
    if (age < 60000) return 'Just now';
    if (age < 3600000) { const minutes = Math.floor(age / 60000); return `${minutes} minute${minutes === 1 ? '' : 's'} ago`; }
    const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    if (days === 0) { const hours = Math.floor(age / 3600000); return `${hours} hour${hours === 1 ? '' : 's'} ago`; }
    if (days === 1) return 'Yesterday';
    if (days > 1 && days < 7) return `${days} days ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

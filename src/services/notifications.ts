import { apiRequest } from './api';

// ========================================
// IMPORTANT NOTIFICATION CONTRACT AND OWNED API
// Navigation metadata contains IDs only; no token or private donor details.
// ========================================
export type ImportantNotification = {
  id: number; type: 'admin_announcement' | 'donation_completed' | 'donation_rejected' | 'donation_needs_revision' | 'donation_reminder';
  title: string; message: string; data: { opportunity_id?: number | null; participation_id?: number; event_date?: string; reminder_date?: string } | null;
  read_at: string | null; created_at: string;
};
export type NotificationPage = { data: ImportantNotification[]; current_page: number; last_page: number; total: number };
export type HomeReminder = { notification: ImportantNotification; activity_title: string; event_date: string; start_time: string | null; remaining_seconds: number };
export type HomeReminders = { reminders: HomeReminder[]; server_time: string };
export const notificationApi = {
  reminders: (token: string) => apiRequest<HomeReminders>('/notifications/reminders', { token }),
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
  const id = item.type === 'admin_announcement' ? item.data?.opportunity_id : item.data?.participation_id;
  if (!Number.isSafeInteger(id) || !id || id < 1) return null;
  if (item.type === 'admin_announcement') return { pathname: '/announcement/[id]' as const, params: { id: String(id) } };
  if (item.type === 'donation_completed' || item.type === 'donation_rejected' || item.type === 'donation_needs_revision' || item.type === 'donation_reminder') return { pathname: '/activity/[id]' as const, params: { id: String(id) } };
  return null;
}

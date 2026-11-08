import { formatCalendarDate, formatDonorDate } from './date-presentation';
import { API_BASE_URL } from './api';

/** Public media only; never turn local/private storage paths into URLs. */
export function publicImageUrl(value: string | null | undefined, collection: 'announcements' | 'rewards' | 'education'): string | null {
  if (!value?.trim()) return null;
  try {
    const base = new URL(API_BASE_URL);
    const raw = value.trim();
    const absolute = /^https?:\/\//i.test(raw);
    const publicPrefix = `/storage/${collection}/`;
    if (!absolute && !raw.startsWith(publicPrefix)) return null;
    const url = new URL(raw, base.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const path = decodeURIComponent(url.pathname);
    if (/(?:^|\/)(?:private|proofs?|app)(?:\/|$)/i.test(path)) return null;
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())) {
      // Only the requested public collection may use the reachable API host.
      if (!path.startsWith(publicPrefix)) return null;
      return `${base.origin}${url.pathname}${url.search}${url.hash}`;
    }
    return absolute ? raw : url.href;
  } catch {
    return null;
  }
}

export function announcementImageUrl(value?: string | null): string | null {
  return publicImageUrl(value, 'announcements');
}

/** Date-only values are calendar dates, not local-time instants. */
export function formatDonationDate(value?: string | null, fallback = 'Date to be announced'): string {
  return formatCalendarDate(value, fallback);
}
export function formatJoinedDate(value: string): string {
  return formatDonorDate(value);
}

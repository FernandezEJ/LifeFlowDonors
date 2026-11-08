// Display only. Never use these helpers to authorize actions or rewrite API/form values.
const DONOR_TIME_ZONE = 'Asia/Manila';
const DATE_OPTIONS = { month: 'long', day: 'numeric', year: 'numeric' } as const;

function calendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dayFirst = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!iso && !dayFirst) return null;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(dayFirst![3]), Number(dayFirst![2]), Number(dayFirst![1])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/** Calendar values keep their exact day, including when the device is outside the Philippines. */
export function formatCalendarDate(value: unknown, fallback = 'Date unavailable'): string {
  return calendarDate(value)?.toLocaleDateString('en-US', { ...DATE_OPTIONS, timeZone: 'UTC' }) ?? fallback;
}

/** Instants need an explicit offset; never guess a timezone for an ambiguous timestamp. */
export function donorInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null;
  const zone = match[6];
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(-2)) > 59)) return null;
  const milliseconds = match[5] ? match[5].slice(1).padEnd(3, '0').slice(0, 3) : '000';
  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}.${milliseconds}${zone}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDonorDate(value: unknown, fallback = 'Date unavailable'): string {
  const calendar = calendarDate(value);
  if (calendar) return formatCalendarDate(value, fallback);
  return donorInstant(value)?.toLocaleDateString('en-US', { ...DATE_OPTIONS, timeZone: DONOR_TIME_ZONE }) ?? fallback;
}

export function formatDonorDateTime(value: unknown, fallback = 'Date unavailable', separator = ' at '): string {
  const date = donorInstant(value);
  if (!date) return fallback;
  return formatDonorDate(value, fallback) + separator + date.toLocaleTimeString('en-US', {
    timeZone: DONOR_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

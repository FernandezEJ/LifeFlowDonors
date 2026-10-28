// ========================================
// API CONFIGURATION AND SAFE ERRORS
// The fallback is the current LAN development URL for Expo Go.
// Set EXPO_PUBLIC_API_URL to a public HTTPS API for production.
// ========================================
export function resolveApiBaseUrl(value: string | undefined, development: boolean): string {
  const message = 'EXPO_PUBLIC_API_URL must be an absolute public HTTPS URL ending in /api for release builds.';
  if (typeof value !== 'string' || !value.trim()) {
    if (development) return 'http://192.168.6.122:8000/api';
    throw new Error(message);
  }
  const raw = value.trim();
  let url;
  try { url = new URL(raw); } catch { throw new Error(message); }
  if (/[\s\\]/u.test(raw) || raw.includes('@') || raw.includes('?') || raw.includes('#') ||
      !['https:', ...(development ? ['http:'] : [])].includes(url.protocol) ||
      url.pathname.replace(/\/+$/, '') !== '/api') throw new Error(message);
  if (!development) {
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/u.exec(host);
    const localName = host === 'localhost' || /\.(localhost|local|internal|lan)$/u.test(host) ||
      (!host.includes('.') && !host.includes(':'));
    const invalidDns = !ipv4 && !host.includes(':') && (host.length > 253 ||
      host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)));
    const privateV4 = ipv4 && (() => {
      const [a, b] = ipv4.slice(1).map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
    })();
    // Only global-unicast IPv6 literals; reject mapped/loopback/link-local/ULA forms.
    const privateV6 = host.includes(':') && !/^[23][0-9a-f]{3}:/u.test(host);
    if (url.protocol !== 'https:' || localName || invalidDns || privateV4 || privateV6) throw new Error(message);
  }
  return url.origin + '/api';
}

const development = typeof __DEV__ !== 'undefined' && __DEV__ === true;
let apiConfigurationError: string | null = null;
export const API_BASE_URL = (() => {
  try { return resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, development); }
  catch { apiConfigurationError = 'Configure EXPO_PUBLIC_API_URL with a public HTTPS API URL ending in /api. Development HTTP is available only in Expo Go/development mode.'; return ''; }
})();

export class ApiError extends Error {
  transportMessage?: string;
  transportName?: string;
  constructor(message: string, public status = 0, public fields: Record<string, string[]> = {}, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}



function safeTransportDiagnostic(error: unknown, token?: string, body?: FormData) {
  const native = typeof error === 'object' && error !== null ? error as { name?: unknown; message?: unknown } : {};
  const privateValues = [token];
  // Read metadata only, never file bytes or response content.
  if (body && typeof body.entries === 'function') {
    for (const [, part] of body.entries()) {
      if (typeof part === 'object' && part !== null) {
        const file = part as { name?: string; uri?: string };
        privateValues.push(file.name, file.uri);
        if (file.uri) privateValues.push(file.uri.split('/').pop());
      }
    }
  }
  const redact = (value: unknown, fallback: string) => {
    let text = typeof value === 'string' ? value : fallback;
    for (const secret of privateValues) {
      if (secret) text = text.split(secret).join('[redacted]');
    }
    return text
      .replace(/authorization\s*[:=][^\r\n]*/gi, '[authorization redacted]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/(?:response\s*(?:body|data)|file\s*contents?)\s*[:=][\s\S]*/gi, '[private content redacted]')
      .replace(/\{[\s\S]*\}|\[[\s\S]*"(?:[^"]+)"[\s\S]*\]/g, '[structured content redacted]')
      .replace(/\b(?:file|content|https?):\/\/[^\s"'<>]+/gi, '[URI redacted]')
      .replace(/\b[A-Z]:[\\/][^\r\n"'<>]*|\/(?:data|storage|private|var|tmp|Users|home|sdcard)\/[^\r\n"'<>]*/gi, '[path redacted]')
      .replace(/[^\s"'<>\\/]+\.(?:jpe?g|png|pdf|txt|json|heic|webp)\b/gi, '[filename redacted]')
      .slice(0, 1000);
  };
  return { name: redact(native.name, 'Error'), message: redact(native.message, 'No native error message supplied') };
}


export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

// ========================================
// JSON REQUESTS
// Adds a bearer token only when supplied, limits waiting time,
// and keeps server internals out of visible error messages.
// ========================================
export async function apiRequest<T>(path: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string; body?: unknown; timeoutMs?: number;
} = {}): Promise<T> {
  if (apiConfigurationError) throw new ApiError(apiConfigurationError);
  // ========================================
  // MULTIPART PROOF SUPPORT
  // Fetch supplies multipart boundaries; JSON behavior remains unchanged.
  // ========================================
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const requestFetch = multipart ? (await import('expo/fetch')).fetch : fetch;
    const response = await requestFetch(`${API_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: multipart ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const fields: Record<string, string[]> = {};
      if (response.status === 422 && data?.errors && typeof data.errors === 'object') {
        for (const [key, messages] of Object.entries(data.errors)) {
          if (Array.isArray(messages)) fields[key] = messages.filter((message): message is string => typeof message === 'string');
        }
      }
      const message = response.status === 422 ? (Object.values(fields).flat().join('\n') || 'Please check your details.')
        : response.status === 401 ? (options.token ? 'Your session has expired. Please log in again.' : 'Invalid email or password.')
        : response.status === 404 ? 'The requested information was not found.'
        : response.status === 409 ? 'This activity has already changed or you have already joined. Refresh and try again.'
        : response.status === 413 ? 'Proof is too large. Select a file no larger than 5 MB.'
        : response.status === 429 ? 'Too many requests. Please try again shortly.'
        : 'The server could not complete the request. Please try again.';
      // Structured conflicts support domain recovery without displaying server internals.
      throw new ApiError(message, response.status, fields, response.status === 409 ? data : undefined);
    }
    if (data === null) throw new ApiError('The server returned an unreadable response. Please try again.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const failure = new ApiError(controller.signal.aborted ? 'The request timed out. Please try again.' : 'Cannot reach LifeFlow. Check your connection and try again.');
    if (multipart && typeof __DEV__ !== 'undefined' && __DEV__) {
      const diagnostic = safeTransportDiagnostic(error, options.token, options.body as FormData);
      failure.transportName = diagnostic.name;
      failure.transportMessage = diagnostic.message;
    }
    throw failure;
  } finally {
    clearTimeout(timeout);
  }
}

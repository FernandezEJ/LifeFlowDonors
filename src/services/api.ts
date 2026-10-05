// ========================================
// API CONFIGURATION AND SAFE ERRORS
// The fallback is the current LAN development URL for Expo Go.
// Set EXPO_PUBLIC_API_URL to a public HTTPS API for production.
// ========================================
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.6.122:8000/api').replace(/\/$/, '');

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

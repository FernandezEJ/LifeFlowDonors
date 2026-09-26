// ========================================
// WEB PREVIEW STORAGE
// Session storage supports reloads in the same browser tab.
// Native builds use SecureStore instead; SSR has no stored session.
// ========================================
const TOKEN_KEY = 'lifeflow.sanctum-token';
export const tokenStorage = {
  get: async () => typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY),
  save: async (token: string) => { window.sessionStorage.setItem(TOKEN_KEY, token); },
  remove: async () => { if (typeof window !== 'undefined') window.sessionStorage.removeItem(TOKEN_KEY); },
};

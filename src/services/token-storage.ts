import * as SecureStore from 'expo-secure-store';

// ========================================
// NATIVE TOKEN STORAGE
// Stores only the bearer token in the device's secure storage, never passwords.
// ========================================
const TOKEN_KEY = 'lifeflow.sanctum-token';
export const tokenStorage = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  save: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  remove: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

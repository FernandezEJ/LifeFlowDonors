import * as SecureStore from 'expo-secure-store';

// ========================================
// PERSISTED SPENDING RETRY
// A per-account request key survives closure after a lost success response.
// This contains no credentials and cannot authorize spending without Sanctum.
// ========================================
export type PendingRedemption = { rewardId: number; requestKey: string };
const key = (userId: number) => 'lifeflow-redemption-' + userId;
export const redemptionStorage = {
  read: async (userId: number): Promise<PendingRedemption | null> => {
    const value = await SecureStore.getItemAsync(key(userId));
    return value ? JSON.parse(value) : null;
  },
  save: (userId: number, value: PendingRedemption) => SecureStore.setItemAsync(key(userId), JSON.stringify(value)),
  clear: (userId: number) => SecureStore.deleteItemAsync(key(userId)),
};

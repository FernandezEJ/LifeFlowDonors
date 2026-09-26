import type { PendingRedemption } from './redemption-storage';

// ========================================
// WEB SPENDING RETRY
// Browser storage retains only the account-scoped opaque request key.
// ========================================
const key = (userId: number) => 'lifeflow-redemption-' + userId;
export const redemptionStorage = {
  read: async (userId: number): Promise<PendingRedemption | null> => {
    const value = localStorage.getItem(key(userId));
    return value ? JSON.parse(value) : null;
  },
  save: async (userId: number, value: PendingRedemption) => { localStorage.setItem(key(userId), JSON.stringify(value)); },
  clear: async (userId: number) => { localStorage.removeItem(key(userId)); },
};

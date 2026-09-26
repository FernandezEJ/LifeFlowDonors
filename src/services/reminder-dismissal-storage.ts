import * as SecureStore from 'expo-secure-store';

// Per-donor/per-notification markers survive restarts without changing inbox state.
const key = (userId: number, notificationId: number) => 'lifeflow-reminder-dismissed-' + userId + '-' + notificationId;
export const reminderDismissalStorage = {
  isDismissed: async (userId: number, notificationId: number): Promise<boolean> =>
    (await SecureStore.getItemAsync(key(userId, notificationId))) === '1',
  dismiss: (userId: number, notificationId: number): Promise<void> =>
    SecureStore.setItemAsync(key(userId, notificationId), '1'),
};

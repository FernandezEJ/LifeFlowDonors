const key = (userId: number, notificationId: number) => 'lifeflow-reminder-dismissed-' + userId + '-' + notificationId;
export const reminderDismissalStorage = {
  isDismissed: async (userId: number, notificationId: number): Promise<boolean> =>
    localStorage.getItem(key(userId, notificationId)) === '1',
  dismiss: async (userId: number, notificationId: number): Promise<void> => {
    localStorage.setItem(key(userId, notificationId), '1');
  },
};

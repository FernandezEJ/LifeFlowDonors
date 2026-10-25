import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './auth-context';
import { notificationDestination } from '@/services/notifications';
import { getPushRegistration, nativeNotifications } from '@/services/push-notifications';

// ========================================
// SHARED INBOX BADGE AND PUSH LIFECYCLE
// Focus/foreground refreshes are coalesced, never polled. This provider is
// remounted on account changes to discard the previous user's inbox state.
// ========================================
type NotificationContextValue = {
  unreadCount: number; refreshCount: (force?: boolean) => Promise<void>;
  enablePush: () => Promise<void>; pushStatus: string;
};
const NotificationContext = createContext<NotificationContextValue | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, notificationCount, readNotification, captureDeviceTokenSession } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushStatus, setPushStatus] = useState('');
  const countRequest = useRef<Promise<void> | null>(null);
  const lastCount = useRef(0);
  const active = useRef(true);
  const enableRegistration = useRef<() => Promise<void>>(() => Promise.resolve());
  const lastDeviceToken = useRef<string | null>(null);
  const handled = useRef(new Set<string>());

  const refreshCount = useCallback(async (force = false) => {
    if (!userId) return;
    if (countRequest.current) { await countRequest.current; if (!force) return; }
    if (!force && Date.now() - lastCount.current < 15000) return;
    const request = notificationCount().then(result => {
      if (active.current) { setUnreadCount(result.unread_count); lastCount.current = Date.now(); }
    }).catch(() => { /* Keep the last successful badge; inbox offers retry. */ })
      .finally(() => { countRequest.current = null; });
    countRequest.current = request;
    return request;
  }, [userId, notificationCount]);

  // ========================================
  // AUTHENTICATED PUSH TAPS AND FOREGROUND EVENTS
  // Resolve each valid push ID through the owned API before navigating.
  // Old-account pushes cannot expose the old account's participation.
  // ========================================
  useEffect(() => {
    active.current = true;
    if (!userId) return;
    let disposed = false;
    const session = captureDeviceTokenSession();
    const current = () => !disposed && session.isCurrent();
    let queue = Promise.resolve();
    let passiveRequest: Promise<void> | null = null;
    let latestToken: import('expo-notifications').DevicePushToken | undefined;
    let tokenRevision = 0;
    let registeredAt = 0;
    const registerPush = (prompt = false, suppliedToken?: import('expo-notifications').DevicePushToken): Promise<void> => {
      if (!current()) return Promise.resolve();
      if (suppliedToken) {
        if (suppliedToken.type !== 'android' || typeof suppliedToken.data !== 'string' || !suppliedToken.data) return Promise.resolve();
        latestToken = suppliedToken;
        tokenRevision++;
      } else if (!prompt && passiveRequest) return passiveRequest;
      const request = queue.then(async () => {
        if (!current() || (suppliedToken && suppliedToken.data !== latestToken?.data)) return;
        try {
          const revision = tokenRevision;
          const result = await getPushRegistration(prompt, suppliedToken);
          if (!current()) return;
          // A rotation emitted during the native lookup wins over its older result.
          const deviceToken = result.token ? (tokenRevision !== revision ? latestToken?.data ?? result.token : result.token) : undefined;
          if (deviceToken) {
            // Keep last_seen_at fresh without POSTing on every foreground event.
            if (deviceToken !== lastDeviceToken.current || Date.now() - registeredAt >= 24 * 60 * 60 * 1000) {
              await session.register(deviceToken);
              if (!current()) return;
              lastDeviceToken.current = deviceToken;
              registeredAt = Date.now();
            }
          } else if (result.status === 'denied' && lastDeviceToken.current) {
            await session.unregister(lastDeviceToken.current);
            if (!current()) return;
            lastDeviceToken.current = null;
            registeredAt = 0;
          }
          setPushStatus(result.status === 'enabled' ? 'Phone permission allowed; device registration is up to date. Delivery depends on Android settings.'
            : result.status === 'denied' ? 'Notifications are off. Enable them in your phone settings.'
            : result.status === 'unavailable' ? 'Phone push is available in an Android device build. Your inbox still works here.'
            : 'Enable phone alerts for important updates only.');
        } catch {
          if (current()) setPushStatus('Phone alerts could not be registered. You can try again; your inbox still works.');
        }
      });
      queue = request;
      if (!prompt && !suppliedToken) {
        passiveRequest = request;
        void request.then(() => { if (passiveRequest === request) passiveRequest = null; });
      }
      return request;
    };
    enableRegistration.current = () => registerPush(true);
    const subscriptions: { remove: () => void }[] = [];
    const handleTap = async (response: import('expo-notifications').NotificationResponse | null) => {
      if (!response || !current()) return;
      const rawId = response.notification.request.content.data?.notification_id;
      const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN;
      if (!Number.isSafeInteger(id) || id < 1) return;
      const key = response.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      try {
        const result = await readNotification(id);
        if (!current()) return;
        const target = notificationDestination(result.notification);
        if (target) router.push(target);
        await refreshCount(true);
      } catch { /* Invalid, stale or other-account pushes do not navigate. */ }
    };
    void refreshCount();
    // All permission/native/API work is serialized and scoped to this login.
    void registerPush();
    const appState = AppState.addEventListener('change', state => {
      if (current() && state === 'active') { void refreshCount(); void registerPush(); }
    });
    void nativeNotifications().then(async notifications => {
      if (!notifications || !current()) return;
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
        }),
      });
      subscriptions.push(notifications.addNotificationReceivedListener(() => { if (current()) void refreshCount(true); }));
      subscriptions.push(notifications.addPushTokenListener(token => { void registerPush(false, token); }));
      subscriptions.push(notifications.addNotificationResponseReceivedListener(response => { void handleTap(response); }));
      await handleTap(await notifications.getLastNotificationResponseAsync());
      if (current()) await notifications.clearLastNotificationResponseAsync();
    }).catch(() => { /* Missing native capability never prevents inbox access. */ });
    return () => {
      disposed = true; active.current = false; appState.remove();
      enableRegistration.current = () => Promise.resolve();
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [userId, readNotification, router, refreshCount, captureDeviceTokenSession]);

  return <NotificationContext.Provider value={{ unreadCount, refreshCount, pushStatus, enablePush: () => enableRegistration.current() }}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications requires NotificationProvider');
  return context;
}

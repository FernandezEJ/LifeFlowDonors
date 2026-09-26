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
  const { user, notificationCount, readNotification, registerDeviceToken, unregisterDeviceToken } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushStatus, setPushStatus] = useState('');
  const countRequest = useRef<Promise<void> | null>(null);
  const lastCount = useRef(0);
  const active = useRef(true);
  const pushBusy = useRef(false);
  const lastDeviceToken = useRef<string | null>(null);
  const handled = useRef(new Set<string>());

  const refreshCount = useCallback(async (force = false) => {
    if (!user) return;
    if (countRequest.current) { await countRequest.current; if (!force) return; }
    if (!force && Date.now() - lastCount.current < 15000) return;
    const request = notificationCount().then(result => {
      if (active.current) { setUnreadCount(result.unread_count); lastCount.current = Date.now(); }
    }).catch(() => { /* Keep the last successful badge; inbox offers retry. */ })
      .finally(() => { countRequest.current = null; });
    countRequest.current = request;
    return request;
  }, [user, notificationCount]);

  // ========================================
  // OPT-IN AND TOKEN REFRESH
  // Denial never opens an automatic prompt. Backend calls reuse AuthProvider's
  // bearer token and protection against responses from a signed-out session.
  // ========================================
  const registerPush = useCallback(async (prompt = false) => {
    if (!user || pushBusy.current) return;
    pushBusy.current = true;
    try {
      const result = await getPushRegistration(prompt);
      if (!active.current) return;
      if (result.token) {
        await registerDeviceToken(result.token);
        lastDeviceToken.current = result.token;
      } else if (result.status === 'denied' && lastDeviceToken.current) {
        await unregisterDeviceToken(lastDeviceToken.current);
        lastDeviceToken.current = null;
      }
      if (active.current) setPushStatus(result.status === 'enabled' ? 'Important notifications enabled.'
        : result.status === 'denied' ? 'Notifications are off. Enable them in your phone settings.'
        : result.status === 'unavailable' ? 'Phone push is available in an Android device build. Your inbox still works here.'
        : 'Enable phone alerts for important updates only.');
    } catch {
      if (active.current) setPushStatus('Phone alerts could not be registered. You can try again; your inbox still works.');
    } finally { pushBusy.current = false; }
  }, [user, registerDeviceToken, unregisterDeviceToken]);

  // ========================================
  // AUTHENTICATED PUSH TAPS AND FOREGROUND EVENTS
  // Resolve each valid push ID through the owned API before navigating.
  // Old-account pushes cannot expose the old account's participation.
  // ========================================
  useEffect(() => {
    active.current = true;
    if (!user) return;
    let disposed = false;
    const subscriptions: { remove: () => void }[] = [];
    const handleTap = async (response: import('expo-notifications').NotificationResponse | null) => {
      if (!response || disposed) return;
      const rawId = response.notification.request.content.data?.notification_id;
      const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && /^[1-9][0-9]*$/.test(rawId) ? Number(rawId) : NaN;
      if (!Number.isSafeInteger(id) || id < 1) return;
      const key = response.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      try {
        const result = await readNotification(id);
        if (disposed) return;
        const target = notificationDestination(result.notification);
        if (target) router.push(target);
        await refreshCount(true);
      } catch { /* Invalid, stale or other-account pushes do not navigate. */ }
    };
    void refreshCount();
    // Permission/token work updates state only after the asynchronous native call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void registerPush();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') { void refreshCount(); void registerPush(); }
    });
    void nativeNotifications().then(async notifications => {
      if (!notifications || disposed) return;
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false,
        }),
      });
      subscriptions.push(notifications.addNotificationReceivedListener(() => { void refreshCount(true); }));
      subscriptions.push(notifications.addPushTokenListener(() => { void registerPush(); }));
      subscriptions.push(notifications.addNotificationResponseReceivedListener(response => { void handleTap(response); }));
      await handleTap(await notifications.getLastNotificationResponseAsync());
      if (!disposed) await notifications.clearLastNotificationResponseAsync();
    }).catch(() => { /* Missing native capability never prevents inbox access. */ });
    return () => {
      disposed = true; active.current = false; appState.remove();
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [user, readNotification, router, refreshCount, registerPush]);

  return <NotificationContext.Provider value={{ unreadCount, refreshCount, pushStatus, enablePush: () => registerPush(true) }}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications requires NotificationProvider');
  return context;
}

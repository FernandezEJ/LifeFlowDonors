import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Linking, Platform } from 'react-native';

// ========================================
// NATIVE ANDROID FCM CAPABILITY
// Expo Go, web and iOS keep the inbox. iOS native tokens are APNs,
// not FCM tokens, so they are never mislabeled for the Android sender.
// ========================================
export async function nativeNotifications() {
  if (Platform.OS !== 'android' || !isDevice || Constants.executionEnvironment === 'storeClient') return null;
  return import('expo-notifications');
}
export type PushRegistration = { status: 'enabled' | 'denied' | 'available' | 'unavailable'; token?: string };

// Permission and channel state are separate from successful FCM registration/delivery.
export async function phoneNotificationPermission() {
  const notifications = await nativeNotifications();
  if (!notifications) return null;
  const permission = await notifications.getPermissionsAsync();
  let channelBlocked: boolean | null = null;
  try {
    const channel = await notifications.getNotificationChannelAsync('important');
    if (channel) channelBlocked = channel.importance === notifications.AndroidImportance.NONE;
  } catch { /* Some Android versions cannot inspect channels; permission is still usable. */ }
  return { granted: permission.granted, canAskAgain: permission.canAskAgain, channelBlocked };
}

// Read existing controls only. Never recreate a channel or replace the donor's sound settings.
export async function openPhoneNotificationSettings(preferChannel = false): Promise<boolean> {
  const notifications = await nativeNotifications();
  if (!notifications) return false;
  const packageName = Constants.expoConfig?.android?.package;
  if (packageName) {
    const appExtra = { key: 'android.provider.extra.APP_PACKAGE', value: packageName };
    if (preferChannel) {
      try {
        if (await notifications.getNotificationChannelAsync('important')) {
          await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [appExtra,
            { key: 'android.provider.extra.CHANNEL_ID', value: 'important' }]);
          return true;
        }
      } catch { /* OEM channel settings may not exist; try app notification settings. */ }
    }
    try {
      await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [appExtra]);
      return true;
    } catch { /* Older/OEM Android versions can still open the app's general settings. */ }
  }
  try { await Linking.openSettings(); return true; } catch { return false; }
}

// ========================================
// EXPLICIT PERMISSION AND PASSIVE REGISTRATION
// Only a user action may prompt (Android can report denied before first ask). Launch/foreground checks never prompt denied
// users, but refresh the token of a device that already granted permission.
// ========================================
export async function getPushRegistration(requestPermission = false, suppliedToken?: import('expo-notifications').DevicePushToken): Promise<PushRegistration> {
  const notifications = await nativeNotifications();
  if (!notifications) return { status: 'unavailable' };
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) {
    await notifications.setNotificationChannelAsync('important', {
      name: 'Important LifeFlow updates', importance: notifications.AndroidImportance.DEFAULT,
    });
    permission = await notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return { status: permission.status === 'denied' ? 'denied' : 'available' };
  await notifications.setNotificationChannelAsync('important', {
    name: 'Important LifeFlow updates', importance: notifications.AndroidImportance.DEFAULT,
  });
  // Refresh listeners supply their token; fetching another one emits another event.
  const token = suppliedToken ?? await notifications.getDevicePushTokenAsync();
  if (token.type !== 'android' || typeof token.data !== 'string' || !token.data) return { status: 'unavailable' };
  return { status: 'enabled', token: token.data };
}

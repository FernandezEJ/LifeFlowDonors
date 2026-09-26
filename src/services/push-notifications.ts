import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';

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

// ========================================
// EXPLICIT PERMISSION AND PASSIVE REGISTRATION
// Only a user action may prompt (Android can report denied before first ask). Launch/foreground checks never prompt denied
// users, but refresh the token of a device that already granted permission.
// ========================================
export async function getPushRegistration(requestPermission = false): Promise<PushRegistration> {
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
  const token = await notifications.getDevicePushTokenAsync();
  if (token.type !== 'android' || typeof token.data !== 'string' || !token.data) return { status: 'unavailable' };
  return { status: 'enabled', token: token.data };
}

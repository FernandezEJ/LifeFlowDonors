import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { NotificationProvider } from '@/contexts/notification-context';
import { Stack, useSegments } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { ActivityIndicator, Button, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep the native artwork static; Expo Router still owns the existing hide timing.
SplashScreen.setOptions({ fade: false, duration: 0 });

export const unstable_settings = {
  initialRouteName: 'index',
};

const lightTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors,
  primary: PALETTE.primary, background: PALETTE.cream, card: PALETTE.surface,
  text: PALETTE.text, border: PALETTE.border, notification: PALETTE.danger,
} };

// ========================================
// ROOT AUTH PROVIDER
// Shares one session across the existing navigation tree.
// ========================================
export default function RootLayout() {
  return <AuthProvider><NotificationSession /></AuthProvider>;
}

// ========================================
// SESSION GATE AND PROTECTED ROUTES
// Validates saved sessions before rendering and guards all account routes.
// ========================================
// ========================================
// ACCOUNT-SCOPED NOTIFICATION STATE
// Remounts badge/push listeners on account change without exposing tokens.
// ========================================
function NotificationSession() {
  const { user } = useAuth();
  return <NotificationProvider key={user?.id ?? 'guest'}><SessionNavigator /></NotificationProvider>;
}

function SessionNavigator() {
  const colorScheme = useColorScheme();
  const [route] = useSegments();
  const { user, restoring, sessionError, restore } = useAuth();
  // Most screens stay light in device dark mode. Only Flowie's own dark
  // surfaces need light icons; startup/session errors always have a light backdrop.
  const darkFlowie = colorScheme === 'dark' && ['flowie', 'flowie-history', 'flowie-recently-deleted', 'flowie-conversation'].includes(route);
  const statusBarStyle = !!user && !restoring && !sessionError && darkFlowie ? 'light' : 'dark';

  return <>
    <StatusBar style={statusBarStyle} hidden={false} />
    {restoring || sessionError ? <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: PALETTE.cream }}>
      {restoring ? <><ActivityIndicator color={PALETTE.primary} /><Text style={{color:PALETTE.text}}>Restoring session...</Text></> :
        <><Text style={{color:PALETTE.danger}}>{sessionError}</Text><Button color={PALETTE.primary} title="Retry" onPress={() => void restore()} /></>}
    </SafeAreaView> :
    <ThemeProvider value={darkFlowie ? DarkTheme : lightTheme}>
      <Stack screenOptions={{ statusBarStyle, statusBarHidden: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="help-about" options={{ headerShown: false }} />
          <Stack.Screen name="profile-settings" options={{ headerShown: false }} />
          <Stack.Screen name="profile-settings/[setting]" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
          <Stack.Screen name="donation-preparation" options={{ headerShown: false }} />
          <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
          <Stack.Screen name="redeem" options={{ title: 'Redeem Points' }} />
          <Stack.Screen name="voucher" options={{ title: 'Voucher' }} />
          <Stack.Screen name="my-vouchers" />
          <Stack.Screen name="flowie" />
          <Stack.Screen name="flowie-history" />
          <Stack.Screen name="flowie-recently-deleted" />
          <Stack.Screen name="flowie-conversation/[id]" />
          <Stack.Screen name="evaluation" />
          <Stack.Screen name="activity/[id]" />
          <Stack.Screen name="announcements" options={{ headerShown: false }} />
          <Stack.Screen name="announcement/[id]" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>}
  </>;
}

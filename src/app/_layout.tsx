import { NotificationProvider } from '@/contexts/notification-context';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { StatusBar } from 'expo-status-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  initialRouteName: 'index',
};

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
  const { user, restoring, sessionError, restore } = useAuth();
  if (restoring || sessionError) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FFF9F2' }}>
      {restoring ? <><ActivityIndicator color="#D93A3A" /><Text>Restoring session...</Text></> :
        <><Text>{sessionError}</Text><Button title="Retry" onPress={() => void restore()} /></>}
    </View>;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
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
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

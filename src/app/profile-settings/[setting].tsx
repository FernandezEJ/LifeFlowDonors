import { ProfileMascotSelector } from '@/components/profile-mascot-selector';
import { ChangeEmailForm } from '@/components/account-settings-forms';
import { useAuth } from '@/contexts/auth-context';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ProfileSettingsPage } from '@/components/profile-settings-page';
import { ACCOUNT_SETTINGS } from '@/constants/profile-settings';

// Known settings only: route parameters never become actions or account writes.
export default function ProfileSettingScreen() {
  const { user } = useAuth();
  const { setting } = useLocalSearchParams<{ setting?: string | string[] }>();
  const item = ACCOUNT_SETTINGS.find(entry => entry.key === setting);
  return <ProfileSettingsPage title={item?.title ?? 'Profile Settings'} fallback="/profile-settings">
    {item?.key === 'email' ? <ChangeEmailForm key={user?.id} /> : item?.key === 'avatar' ? <ProfileMascotSelector key={user?.id} /> : <View style={styles.card}>
      <Text style={styles.message}>This setting is not available.</Text>
    </View>}
  </ProfileSettingsPage>;
}
const styles = StyleSheet.create({
  card: { padding: 24, alignItems: 'center', gap: 20, borderWidth: 1, borderColor: '#F0E2DC', borderRadius: 18, backgroundColor: '#FFFFFF' },
  message: { color: '#766A68', fontSize: 15, lineHeight: 23, textAlign: 'center' },
});

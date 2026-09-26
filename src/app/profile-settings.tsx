import { useAuth } from '@/contexts/auth-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileSettingsPage } from '@/components/profile-settings-page';
import { ACCOUNT_SETTINGS, profileMascotImage } from '@/constants/profile-settings';

// ========================================
// PROFILE SETTINGS MENU
// Groups account entries and the existing important-notification controls.
// Account rows open the dedicated email, password and default-mascot screens.
// ========================================
export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  return <ProfileSettingsPage title="Profile Settings" fallback="/(tabs)/profile">
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>ACCOUNT</Text>
      <View style={styles.card}>
        {ACCOUNT_SETTINGS.map((item, index) => <Pressable key={item.key} accessibilityRole="button"
          onPress={() => router.push({ pathname: '/profile-settings/[setting]', params: { setting: item.key } })}
          style={({ pressed }) => [styles.row, index > 0 && styles.separator, pressed && styles.pressed]}>
          {item.key === 'avatar' ? <Image source={profileMascotImage(profile?.profile_avatar)} resizeMode="contain" style={styles.mascot} accessibilityLabel="LifeFlow profile mascot" />
            : <MaterialIcons name={item.icon} size={25} color="#D93A3A" />}
          <View style={styles.labels}><Text style={styles.title}>{item.title}</Text><Text style={styles.description}>{item.description}</Text></View>
          <MaterialIcons name="chevron-right" size={23} color="#766A68" />
        </Pressable>)}
      </View>
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>PREFERENCES</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/notifications')}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <MaterialIcons name="notifications-none" size={25} color="#D93A3A" />
          <View style={styles.labels}><Text style={styles.title}>Notification Settings</Text><Text style={styles.description}>Manage important LifeFlow notifications</Text></View>
          <MaterialIcons name="chevron-right" size={23} color="#766A68" />
        </Pressable>
      </View>
    </View>
  </ProfileSettingsPage>;
}
const styles = StyleSheet.create({
  section: { gap: 10 },
  heading: { color: '#766A68', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  card: { borderWidth: 1, borderColor: '#F0E2DC', borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  separator: { borderTopWidth: 1, borderTopColor: '#F0E2DC' },
  pressed: { backgroundColor: '#FFF5F2' },
  labels: { flex: 1, gap: 4 },
  title: { color: '#372E2E', fontSize: 15, fontWeight: '700' },
  description: { color: '#766A68', fontSize: 12, lineHeight: 18 },
  mascot: { width: 32, height: 40 },
});

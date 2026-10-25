import { ProfileSettingsPage } from '@/components/profile-settings-page';
import { LifeFlowColors as COLORS } from '@/constants/theme';
import { useNotifications } from '@/contexts/notification-context';
import { openPhoneNotificationSettings, phoneNotificationPermission } from '@/services/push-notifications';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

const NATIVE_UNAVAILABLE = 'Phone notification controls are available in an Android device build. Your in-app notifications still work here.';

export default function NotificationSettingsScreen() {
  const { enablePush, pushStatus } = useNotifications();
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof phoneNotificationPermission>>>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false), revision = useRef(0), locked = useRef(false);
  const refreshPermission = useCallback(async () => {
    const version = ++revision.current;
    try {
      const result = await phoneNotificationPermission();
      if (active.current && revision.current === version) setPermission(result);
    } catch {
      if (active.current && revision.current === version) setPermission(null);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    setBusy(locked.current);
    void refreshPermission();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { setFeedback(''); void refreshPermission(); }
    });
    return () => { active.current = false; revision.current++; subscription.remove(); };
  }, [refreshPermission]));

  const manage = async (sound: boolean) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFeedback('');
    try {
      const current = await phoneNotificationPermission();
      if (!active.current) return;
      if (!current) { setFeedback(NATIVE_UNAVAILABLE); return; }
      if (!sound && (current.granted || current.canAskAgain)) {
        // Reuse the provider's serialized, account-scoped FCM registration path.
        await enablePush();
        if (!active.current) return;
      }
      if (sound || current.granted || !current.canAskAgain) {
        const opened = await openPhoneNotificationSettings(sound || current.channelBlocked === true);
        if (active.current && !opened) setFeedback('Phone settings could not be opened. Please open LifeFlow notification settings from Android Settings.');
      }
      await refreshPermission();
    } catch {
      if (active.current) setFeedback('Phone notification controls could not be reached. Please try again; your in-app notifications still work.');
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  return <ProfileSettingsPage title="Notification Settings" fallback="/notifications">
    <View style={styles.rows}>
      <Pressable accessibilityRole="button" accessibilityLabel="Phone Notifications" accessibilityState={{ disabled: busy }} disabled={busy}
        onPress={() => void manage(false)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.icon}><MaterialIcons name="notifications-none" size={25} color={COLORS.primary} accessible={false} /></View>
        <View style={styles.labels}><Text style={styles.title}>Phone Notifications</Text>
          <Text style={styles.description}>Manage LifeFlow alerts on your device.</Text>
          {permission ? <Text style={styles.status}>{permission.granted ? 'Android permission allowed.' : 'Android permission not allowed.'}
            {permission.channelBlocked ? ' The LifeFlow notification channel is off.' : ''}</Text> : null}
        </View><MaterialIcons name="chevron-right" size={23} color={COLORS.neutral} accessible={false} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sound & Vibration" accessibilityState={{ disabled: busy }} disabled={busy}
        onPress={() => void manage(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.icon}><MaterialIcons name="volume-up" size={25} color={COLORS.primary} accessible={false} /></View>
        <View style={styles.labels}><Text style={styles.title}>Sound &amp; Vibration</Text>
          <Text style={styles.description}>Manage notification sounds and vibration.</Text></View>
        <MaterialIcons name="chevron-right" size={23} color={COLORS.neutral} accessible={false} />
      </Pressable>
    </View>
    {feedback || pushStatus ? <Text accessibilityLiveRegion="polite" style={styles.description}>{feedback || pushStatus}</Text> : null}
  </ProfileSettingsPage>;
}
const styles = StyleSheet.create({
  rows: { gap: 14 },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, backgroundColor: COLORS.surface },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.selected, alignItems: 'center', justifyContent: 'center' },
  labels: { flex: 1, minWidth: 0, gap: 5 },
  title: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: COLORS.text },
  description: { fontSize: 13, lineHeight: 20, color: COLORS.neutralText },
  status: { fontSize: 12, lineHeight: 18, color: COLORS.primary },
  pressed: { backgroundColor: COLORS.selected },
});

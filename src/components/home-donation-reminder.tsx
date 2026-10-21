import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { useCallback, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { notificationDestination, type HomeReminder } from '@/services/notifications';

import { reminderDismissalStorage } from '@/services/reminder-dismissal-storage';

// Session-only suppression survives tab changes/unmounts and is scoped to the donor.
const shown = new Set<string>();
export function HomeDonationReminder() {
  const { user, homeReminders } = useAuth();
  const router = useRouter();
  const [reminder, setReminder] = useState<HomeReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => {
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const refresh = async () => {
      const version = ++generation.current;
      setReminder(null);
      setError(null);
      clearTimeout(expiry);
      if (!user) return;
      try {
        const result = await homeReminders();
        if (!active || version !== generation.current) return;
        let next: HomeReminder | undefined;
        for (const item of result.reminders) {
          if (item.remaining_seconds > 0 && !shown.has(user.id + ':' + item.notification.id)
            && !await reminderDismissalStorage.isDismissed(user.id, item.notification.id)) {
            next = item;
            break;
          }
        }
        if (!active || version !== generation.current) return;
        if (!next) return;
        shown.add(user.id + ':' + next.notification.id);
        setReminder(next);
        expiry = setTimeout(() => { generation.current++; setReminder(null); }, next.remaining_seconds * 1000);
      } catch { /* The inbox remains available; unknown due state never shows a popup. */ }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
      else { generation.current++; clearTimeout(expiry); setReminder(null); }
    });
    return () => { active = false; generation.current++; clearTimeout(expiry); setReminder(null); subscription.remove(); };
  }, [user, homeReminders]));
  const dismiss = () => { generation.current++; setReminder(null); };
  const acknowledge = async () => {
    if (!reminder || !user || navigating.current) return;
    navigating.current = true; setBusy(true); setError(null);
    const version = generation.current;
    try {
      await reminderDismissalStorage.dismiss(user.id, reminder.notification.id);
      if (version === generation.current) dismiss();
    } catch {
      if (version === generation.current) setError('Could not save dismissal. Please tap Got it to retry.');
    } finally { navigating.current = false; setBusy(false); }
  };
  const view = async () => {
    if (!reminder || navigating.current) return;
    navigating.current = true; setBusy(true);
    const version = generation.current;
    try {
      // Recheck cancellation, expiry and read state before opening a previously displayed reminder.
      const result = await homeReminders();
      if (version !== generation.current) return;
      const current = result.reminders.find(item => item.notification.id === reminder.notification.id && item.remaining_seconds > 0);
      dismiss();
      const destination = current && notificationDestination(current.notification);
      if (destination) router.push(destination);
    } catch { if (version === generation.current) dismiss(); }
    finally { navigating.current = false; setBusy(false); }
  };
  if (!reminder) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
    <View style={styles.overlay}><View style={styles.card} accessibilityViewIsModal>
      <Text style={styles.title}>Your donation is tomorrow</Text>
      <Text style={styles.activity}>{reminder.activity_title}</Text>
      <Text style={{color:PALETTE.text}}>{reminder.event_date}{reminder.start_time ? ' ? ' + reminder.start_time : ''}</Text>
      <Text style={styles.note}>Rest well, eat properly, and stay hydrated.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={view} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Checking...' : 'View Activity'}</Text></Pressable>
      {error && <Text style={{color:PALETTE.danger}} accessibilityRole="alert">{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={acknowledge} style={styles.dismiss}><Text style={{color:PALETTE.text}}>Got it</Text></Pressable>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 22, gap: 14, backgroundColor: PALETTE.cream },
  title: { color: PALETTE.primary, fontSize: 22, fontWeight: '800' }, activity: { color: PALETTE.text, fontSize: 17, fontWeight: '600' },
  note: { color: PALETTE.neutral, lineHeight: 22 }, primary: { minHeight: 48, padding: 14, alignItems: 'center', borderRadius: 14, backgroundColor: PALETTE.primary },
  primaryText: { color: PALETTE.surface, fontWeight: '700' }, dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

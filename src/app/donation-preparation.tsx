import { DonationPreparationModal } from '@/components/donation-preparation-modal';
import { LoadError } from '@/components/load-state';
import { TabSkeleton } from '@/components/tab-skeleton';
import { LifeFlowColors as COLORS } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import type { HomeReminder } from '@/services/notifications';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Voluntary inbox entry always revalidates ownership and eligibility on Laravel;
// it may reopen an already acknowledged guide without rearming Home's popup.
export default function DonationPreparationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, preparationReminder, acknowledgePreparation } = useAuth();
  const router = useRouter();
  const [reminder, setReminder] = useState<HomeReminder | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), active = useRef(false), locked = useRef(false);
  const donorId = user?.id;
  const owner = useRef(donorId);
  useLayoutEffect(() => { owner.current = donorId; }, [donorId]);
  const back = () => { if (!locked.current) { if (router.canGoBack()) router.back(); else router.replace('/notifications'); } };
  const load = useCallback(async () => {
    const version = ++generation.current;
    setReminder(null); setError(''); setLoading(true);
    try {
      if (typeof id !== 'string' || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error('Invalid reminder');
      const requestedAt = Date.now();
      const result = await preparationReminder(Number(id));
      const remaining = result.reminder.remaining_seconds - Math.max(0, (Date.now() - requestedAt) / 1000);
      if (remaining <= 0) throw new ApiError('Expired reminder', 409);
      if (active.current && version === generation.current && owner.current === donorId) setReminder({ ...result.reminder, remaining_seconds: remaining });
    } catch (failure) {
      if (active.current && version === generation.current) setError(failure instanceof ApiError && [404, 409].includes(failure.status)
        ? 'This preparation reminder is no longer available. You can still review your activity from Activity.' : errorMessage(failure));
    } finally { if (version === generation.current) setLoading(false); }
  }, [id, preparationReminder, donorId]);
  useFocusEffect(useCallback(() => {
    active.current = true; void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
      else { generation.current++; setReminder(null); }
    });
    return () => { active.current = false; generation.current++; subscription.remove(); };
  }, [load]));
  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(() => {
      generation.current++; setReminder(null); setError('This preparation reminder is no longer available.');
    }, reminder.remaining_seconds * 1000);
    return () => clearTimeout(timer);
  }, [reminder]);
  const complete = async (flowie: boolean) => {
    if (!reminder || locked.current || !active.current) return;
    const version = generation.current, donor = user?.id;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await acknowledgePreparation(reminder.notification.id);
      if (!active.current || version !== generation.current || donor !== owner.current) return;
      if (!result.acknowledged) throw new Error('Acknowledgement unavailable');
      locked.current = false;
      if (flowie) router.push({ pathname: '/flowie', params: { preparationKey: String(reminder.notification.id), preparationTitle: reminder.activity_title, preparationDate: reminder.event_date } });
      else back();
    } catch (failure) {
      if (active.current && version === generation.current) {
        if (failure instanceof ApiError && [404, 409].includes(failure.status)) { setReminder(null); setError('This preparation reminder is no longer available.'); }
        else setError('Could not save your acknowledgement. Check your connection and tap either button to retry.');
      }
    } finally { locked.current = false; if (donor === owner.current) setBusy(false); }
  };
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} disabled={busy} style={styles.back}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
        </Pressable><Text style={styles.title}>Donation Preparation</Text>
      </View>
      {loading ? <TabSkeleton variant="activity-detail" label="Loading preparation guide" /> : null}
      {error && !reminder ? <LoadError message={error} subject="preparation guide" onRetry={load} loading={loading} /> : null}
      <DonationPreparationModal visible={!!reminder && !loading} busy={busy} error={error}
        onFlowie={() => void complete(true)} onAcknowledge={() => void complete(false)} onBack={back} />
    </SafeAreaView>
  </>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream }, header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, title: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '700' },
});

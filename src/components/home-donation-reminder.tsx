import { DonationPreparationModal } from '@/components/donation-preparation-modal';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/services/api';
import type { HomeReminder } from '@/services/notifications';

// Back/blur suppression is session-only. Only Laravel acknowledgement suppresses
// future sessions/devices, independently of notification read state.
const shown = new Set<string>();
export function HomeDonationReminder() {
  const { user, homeReminders, acknowledgePreparation } = useAuth();
  const router = useRouter();
  const owner = useRef(user?.id);
  useLayoutEffect(() => { owner.current = user?.id; }, [user]);
  const [visible, setVisible] = useState<{ owner: number; reminder: HomeReminder } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0), locked = useRef(false);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const reminder = visible?.owner === user?.id ? visible?.reminder : null;
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = async () => {
      const version = ++generation.current;
      setVisible(null); setError(null); clearTimeout(expiry.current);
      if (!user) return;
      try {
        const requestedAt = Date.now();
        const result = await homeReminders();
        if (!active || version !== generation.current || owner.current !== user.id) return;
        const elapsed = Math.max(0, (Date.now() - requestedAt) / 1000);
        const next = result.reminders.find(item => item.remaining_seconds > elapsed
          && !shown.has(user.id + ':' + (item.notification.data?.opportunity_id ?? item.notification.data?.participation_id)));
        if (!next) return;
        shown.add(user.id + ':' + (next.notification.data?.opportunity_id ?? next.notification.data?.participation_id));
        setVisible({ owner: user.id, reminder: next });
        expiry.current = setTimeout(() => { generation.current++; setVisible(null); }, (next.remaining_seconds - elapsed) * 1000);
      } catch { /* Unknown due state never shows a popup; inbox remains available. */ }
    };
    refreshRef.current = refresh;
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { if (!locked.current) void refresh(); }
      else { generation.current++; clearTimeout(expiry.current); setVisible(null); }
    });
    return () => {
      active = false; generation.current++; clearTimeout(expiry.current); setVisible(null);
      subscription.remove();
    };
  }, [user, homeReminders]));
  const dismiss = () => { generation.current++; clearTimeout(expiry.current); setVisible(null); };
  const complete = async (flowie: boolean) => {
    if (locked.current) return;
    if (!reminder || !user) return;
    locked.current = true; setBusy(true); setError(null);
    const version = generation.current, donorId = user.id;
    try {
      const result = await acknowledgePreparation(reminder.notification.id);
      if (version !== generation.current || owner.current !== donorId) return;
      if (!result.acknowledged) throw new Error('Acknowledgement unavailable');
      dismiss();
      if (flowie) router.push({ pathname: '/flowie', params: {
        preparationTitle: reminder.activity_title, preparationDate: reminder.event_date,
        preparationKey: String(reminder.notification.id),
      } });
      else await refreshRef.current();
    } catch (failure) {
      if (version === generation.current && owner.current === donorId) {
        if (failure instanceof ApiError && [404, 409].includes(failure.status)) dismiss();
        else setError('Could not save your acknowledgement. Check your connection and tap either button to retry.');
      }
    } finally { locked.current = false; if (owner.current === donorId) setBusy(false); }
  };
  return <DonationPreparationModal visible={!!reminder} busy={busy} error={error}
    onFlowie={() => void complete(true)} onAcknowledge={() => void complete(false)} onBack={dismiss} />;
}

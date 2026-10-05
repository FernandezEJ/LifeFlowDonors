import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import type { EligibilityState } from '@/services/eligibility';

// The countdown is presentation only. Zero never unlocks a form without a GET.
export function formatEligibilityWait(seconds: number): string {
  if (seconds <= 0) return 'Checking evaluation availability...';
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return 'Evaluate again in ' + (hours ? hours + 'h ' : '') + (minutes % 60) + 'm';
}
export function useEligibilityCooldown() {
  const { eligibilityState, user } = useAuth();
  const [state, setState] = useState<EligibilityState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const focused = useRef(false);
  const owner = useRef(user?.id);
  const origin = useRef(0);
  const checkedDeadline = useRef(false);
  const checkedDonationDeadline = useRef(false);

  // Invalidate older responses, including a GET started before a POST conflict.
  const accept = useCallback((saved: EligibilityState) => {
    if (!focused.current) return;
    generation.current++;
    origin.current = performance.now();
    checkedDeadline.current = false;
    checkedDonationDeadline.current = false;
    setState(saved); setRemaining(saved.remaining_seconds);
    setError(''); setLoading(false);
  }, []);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const saved = await eligibilityState();
      if (focused.current && request === generation.current) accept(saved);
    } catch (failure) {
      if (focused.current && request === generation.current) setError(errorMessage(failure));
    } finally {
      if (focused.current && request === generation.current) setLoading(false);
    }
  }, [eligibilityState, accept]);

  // Recheck on entry and foreground. Blur discards responses from this screen.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (owner.current !== user?.id) { setState(null); owner.current = user?.id; }
    // Session changes clear availability before requesting private history.
    if (!user?.id) {
      setLoading(false);
      return () => { focused.current = false; generation.current++; };
    }
    void reload();
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') void reload();
      else { generation.current++; setLoading(true); }
    });
    return () => { focused.current = false; generation.current++; listener.remove(); };
  }, [reload, user?.id]));

  useEffect(() => {
    if (!state?.cooldown_active && !state?.is_on_donation_cooldown) return;
    const tick = () => {
      if (!focused.current || AppState.currentState !== 'active') return;
      const elapsed = (performance.now() - origin.current) / 1000;
      const seconds = Math.max(0, Math.ceil(state.remaining_seconds - elapsed));
      setRemaining(seconds);
      const assessmentDue = state.cooldown_active && seconds === 0 && !checkedDeadline.current;
      const donationDue = state.is_on_donation_cooldown && Number.isFinite(state.donation_cooldown_remaining_seconds)
        && state.donation_cooldown_remaining_seconds! <= elapsed && !checkedDonationDeadline.current;
      if (assessmentDue || donationDue) {
        if (donationDue) checkedDonationDeadline.current = true;
        if (assessmentDue) checkedDeadline.current = true;
        void reload();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state, reload]);
  return { state, remaining, loading, error, reload, accept,
    canSubmit: !!state && state.cooldown_active === false && !loading && !error };
}

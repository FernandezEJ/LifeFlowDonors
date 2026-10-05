import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/services/api';
import { findActiveFlowie, flowieDisplayMessages, flowieError, loadFlowieDetail, type FlowieConversation, type FlowieStoredMessage } from '@/services/flowie-chat';
import type { FlowieMessage } from '@/services/flowie-preview';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

type Snapshot = { owner: number | null; target: number | undefined; conversation: FlowieConversation | null; id?: number; messages: FlowieStoredMessage[]; fallback: FlowieMessage[]; ready: boolean };
export function useFlowieConversation(target?: number, options: { activeOnly?: boolean } = {}) {
  const activeOnly = options.activeOnly === true;
  const { user, flowieChat, flowieHistory, flowieDetail, endFlowie, deleteFlowie } = useAuth();
  const owner = user?.id ?? null;
  const empty = useCallback((): Snapshot => ({ owner, target, conversation: null, messages: [], fallback: [], ready: false }), [owner, target]);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [action, setAction] = useState<'send' | 'end' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const life = useRef(0), reading = useRef(0), locked = useRef<number | null>(null);
  const identity = useRef({ owner, target });
  const current = useRef(snapshot);
  useEffect(() => { identity.current = { owner, target }; current.current = snapshot; }, [owner, target, snapshot]);
  const valid = snapshot.owner === owner && snapshot.target === target;
  if (!valid) {
    setSnapshot(empty()); setOptimistic(null); setAction(null); setError(''); setLoading(true);
  }
  const active = (version: number) => version === life.current && identity.current.owner === owner && identity.current.target === target;
  // State lives only in this mounted donor screen. Hide it immediately on account/route change, then clear it.
  useEffect(() => {
    const invalidate = () => { life.current++; reading.current++; };
    invalidate(); locked.current = null;
    return invalidate;
  }, [owner, target]);

  const hydrate = useCallback(async (id?: number) => {
    const version = life.current, read = ++reading.current;
    const isCurrent = () => version === life.current && read === reading.current && identity.current.owner === owner && identity.current.target === target;
    const reader = {
      flowieHistory: async (number?: number) => { if (!isCurrent()) throw new Error('Stale view'); return flowieHistory(number); },
      flowieDetail: async (conversationId: number, number?: number) => { if (!isCurrent()) throw new Error('Stale view'); return flowieDetail(conversationId, number); },
    };
    const resolved = id ?? target;
    const result = resolved === undefined ? await findActiveFlowie(reader) : await loadFlowieDetail(reader, resolved);
    if (!isCurrent()) return false;
    setSnapshot({ owner, target, conversation: result.conversation, id: result.conversation?.id, messages: result.messages, fallback: [], ready: true });
    return true;
  }, [owner, target, flowieHistory, flowieDetail]);
  const refresh = useCallback(async () => {
    if (!owner || locked.current !== null) return;
    const version = life.current;
    setLoading(true);
    // Management follows the current active chat; the main chat retains its ended transcript.
    try { if (await hydrate(!activeOnly && current.current.owner === owner && current.current.target === target ? current.current.id : undefined)) setError(''); }
    catch (failure) {
      if (version === life.current) {
        // A cached main chat may have been deleted from History or another device.
        if (failure instanceof ApiError && failure.status === 404 && target === undefined) {
          try { if (await hydrate()) setError(''); }
          catch (retryFailure) { if (version === life.current) { setSnapshot(empty()); setError(flowieError(retryFailure)); } }
        } else {
          if (failure instanceof ApiError && failure.status === 404) setSnapshot(empty());
          setError(flowieError(failure));
        }
      }
    }
    finally { if (version === life.current) setLoading(false); }
  }, [owner, target, hydrate, empty, activeOnly]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { reading.current++; }; }, [refresh]));

  const send = async (text: string) => {
    const view = current.current;
    if (!text.trim() || !owner || locked.current !== null || !view.ready || view.fallback.length > 0 || view.owner !== owner || view.target !== target || view.conversation?.status === 'ended') return false;
    const version = life.current; locked.current = version; reading.current++;
    setAction('send'); setError(''); setOptimistic(text);
    const before = flowieDisplayMessages(view.messages).concat(view.fallback);
    const history = before.slice(-6).map(item => ({ role: item.role === 'user' ? 'user' as const : 'assistant' as const, text: item.message }));
    try {
      const reply = await flowieChat(text, history, view.id);
      if (!active(version)) return false;
      // This fallback contains an authoritative reply, used only if the subsequent history read fails.
      setSnapshot({ ...view, id: reply.conversation_id, fallback: [...view.fallback,
        { id: 'sent-user-' + Date.now(), role: 'user', message: text },
        { id: 'sent-reply-' + Date.now(), role: 'flowie', message: reply.reply, source: 'ai' }] });
      setOptimistic(null);
      try { if (!await hydrate(reply.conversation_id) && active(version)) setError('Your reply was received, but saved history could not refresh. Refresh before sending again.'); }
      catch { if (active(version)) setError('Your reply was received, but saved history could not refresh. Refresh before sending again.'); }
      return true;
    } catch (failure) {
      if (active(version)) {
        // E1 retains failed user requests: reconcile rather than inventing an assistant message.
        try { await hydrate(view.id); } catch { /* Retain the previous confirmed snapshot and editable draft. */ }
        if (active(version)) { setError(flowieError(failure)); setOptimistic(null); }
      }
      return false;
    } finally {
      if (locked.current === version) locked.current = null;
      if (active(version)) { setAction(null); setLoading(false); }
    }
  };
  const mutate = async (kind: 'end' | 'delete') => {
    const view = current.current;
    if (!owner || locked.current !== null || !view.id || view.owner !== owner || view.target !== target) return false;
    const version = life.current; locked.current = version; reading.current++;
    setAction(kind); setError('');
    try {
      const response = await (kind === 'end' ? endFlowie(view.id) : deleteFlowie(view.id));
      if (!active(version)) return false;
      if (kind === 'end') setSnapshot({ ...view, conversation: response.conversation });
      else setSnapshot({ ...empty(), ready: true });
      setOptimistic(null);
      return true;
    } catch (failure) {
      if (active(version)) setError(flowieError(failure));
      return false;
    } finally {
      if (locked.current === version) locked.current = null;
      if (active(version)) setAction(null);
    }
  };
  const startNew = () => {
    if (locked.current !== null || current.current.conversation?.status !== 'ended') return;
    reading.current++;
    // No create call: E1 creates or resolves the active conversation on the first new message.
    setSnapshot({ ...empty(), ready: true }); setOptimistic(null); setError('');
  };
  const messages = valid ? flowieDisplayMessages(snapshot.messages).concat(snapshot.fallback) : [];
  if (valid && optimistic) messages.push({ id: 'pending-user', role: 'user', message: optimistic });
  return { messages, conversation: valid ? snapshot.conversation : null, id: valid ? snapshot.id : undefined,
    ready: valid && snapshot.ready, requiresRefresh: valid && snapshot.fallback.length > 0, loading, busy: valid && action !== null, sending: valid && action === 'send',
    error: valid ? error : '', refresh, send, end: () => mutate('end'), remove: () => mutate('delete'), startNew };
}

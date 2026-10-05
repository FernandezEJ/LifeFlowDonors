import { useAuth } from '@/contexts/auth-context';
import { flowieError, type FlowieConversation, type FlowiePage } from '@/services/flowie-chat';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useFlowieHistory(deleted: boolean) {
  const { user, flowieHistory, flowieDeleted, restoreFlowie } = useAuth();
  const owner = user?.id ?? null;
  const [state, setState] = useState<{ owner: number | null; deleted: boolean; items: FlowieConversation[]; page: number; last: number; ready: boolean }>({ owner, deleted, items: [], page: 0, last: 1, ready: false });
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false), [restoring, setRestoring] = useState<number | null>(null);
  const version = useRef(0), lock = useRef<number | null>(null);
  const mutation = useRef<object | null>(null);
  const ownerRef = useRef(owner);
  const view = useRef(state);
  useEffect(() => { ownerRef.current = owner; view.current = state; }, [owner, state]);
  if (state.owner !== owner || state.deleted !== deleted) {
    setState({ owner, deleted, items: [], page: 0, last: 1, ready: false }); setError(''); setNotice(''); setRestoring(null); setLoading(false);
  }
  const fetchPage = deleted ? flowieDeleted : flowieHistory;
  useEffect(() => {
    const invalidate = () => { version.current++; mutation.current = null; };
    invalidate(); lock.current = null;
    return invalidate;
  }, [owner, deleted]);
  const load = useCallback(async (more = false) => {
    if (!owner || lock.current !== null) return;
    const before = view.current;
    if (more && before.page >= before.last) return;
    const stamp = version.current; lock.current = stamp;
    setLoading(true);
    const number = more ? before.page + 1 : 1;
    try {
      const result: FlowiePage<FlowieConversation> = await fetchPage(number);
      if (stamp !== version.current || ownerRef.current !== owner) return;
      // E1 owns filtering, ordering and lifecycle state. Never infer or force a restored chat active.
      const items = more ? [...before.items, ...result.data] : result.data;
      setState({ owner, deleted, items: [...new Map(items.map(item => [item.id, item])).values()], page: result.current_page, last: result.last_page, ready: true });
      setError('');
    } catch (failure) {
      if (stamp === version.current && ownerRef.current === owner) setError(flowieError(failure));
    } finally {
      if (lock.current === stamp) lock.current = null;
      if (stamp === version.current) setLoading(false);
    }
  }, [owner, deleted, fetchPage]);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; if (!mutation.current) lock.current = null; }; }, [load]));
  const restore = async (id: number) => {
    if (!deleted || !owner || lock.current !== null) return;
    const stamp = version.current; lock.current = stamp; setRestoring(id); setError(''); setNotice('');
    const operation = {}; mutation.current = operation;
    try {
      await restoreFlowie(id);
      if (mutation.current === operation && ownerRef.current === owner) {
        setState(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
        setNotice('Conversation restored. You can view it in Conversation History.');
      }
    } catch (failure) {
      if (mutation.current === operation && ownerRef.current === owner) setError(flowieError(failure));
    } finally {
      if (lock.current === stamp) lock.current = null;
      if (mutation.current === operation) { mutation.current = null; setRestoring(null); }
    }
  };
  const visible = state.owner === owner && state.deleted === deleted;
  return { items: visible ? state.items : [], ready: visible && state.ready, loading, error: visible ? error : '',
    notice: visible ? notice : '', restoring: visible ? restoring : null, more: visible && state.page < state.last,
    refresh: () => load(), loadMore: () => load(true), restore };
}

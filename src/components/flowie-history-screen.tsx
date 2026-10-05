import { ConfirmationModal } from '@/components/confirmation-modal';
import { useFlowieColors } from '@/components/flowie-components';
import { TabSkeleton } from '@/components/tab-skeleton';
import { useFlowieConversation } from '@/hooks/use-flowie-conversation';
import { useFlowieHistory } from '@/hooks/use-flowie-history';
import { flowieDate, type FlowieConversation } from '@/services/flowie-chat';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Only mounted on Conversations; Recently Deleted keeps its existing recovery-only behavior.
export function FlowieManagementActions({ onEnded }: { onEnded: () => Promise<void> }) {
  const chat = useFlowieConversation(undefined, { activeOnly: true });
  const c = useFlowieColors();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const canEnd = chat.ready && chat.conversation?.status === 'active' && !chat.busy && !chat.loading;
  const confirm = async () => {
    if (!confirmEnd || !canEnd) return;
    const success = await chat.end();
    if (!mounted.current) return;
    setConfirmEnd(false);
    if (success) await onEnded();
  };

  return <View style={styles.managementActions}>
    <Pressable accessibilityRole="button" accessibilityLabel="End Conversation"
      accessibilityState={{ disabled: !canEnd, busy: chat.busy }} disabled={!canEnd}
      onPress={() => { if (canEnd) setConfirmEnd(true); }}
      style={[styles.endButton, { backgroundColor: c.primary }, !canEnd && styles.disabled]}>
      {chat.busy ? <ActivityIndicator color={c.white} /> : <Text style={[styles.endText, { color: c.white }]}>End Conversation</Text>}
    </Pressable>
    {chat.error ? <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: c.text }}>{chat.error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh active conversation" disabled={chat.busy || chat.loading}
        style={styles.textButton} onPress={() => void chat.refresh()}><Text style={{ color: c.accent }}>Retry</Text></Pressable></View> : null}
    <ConfirmationModal visible={confirmEnd} title="End Conversation"
      message="End this Flowie conversation? You can still view it later in your conversation history."
      primaryLabel="End" variant="warning" loading={chat.busy}
      onSecondary={() => setConfirmEnd(false)} onPrimary={confirm} />
  </View>;
}

export function FlowieHistoryScreen({ deleted = false }: { deleted?: boolean }) {
  const router = useRouter();
  const c = useFlowieColors();
  const history = useFlowieHistory(deleted);
  const title = deleted ? 'Recently Deleted' : 'Conversations';
  const card = (item: FlowieConversation) => <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
    <Text style={[styles.cardTitle, { color: c.text }]}>{item.title}</Text>
    {deleted ? <>
      <Text style={[styles.detail, { color: c.muted }]}>Deleted {flowieDate(item.deleted_at)}</Text>
      <Text style={[styles.detail, { color: c.muted }]}>Permanently deletes {flowieDate(item.permanent_delete_at)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={'Restore ' + item.title}
        disabled={history.restoring !== null || history.loading || item.recoverable !== true}
        accessibilityState={{ disabled: history.restoring !== null || history.loading || item.recoverable !== true, busy: history.restoring === item.id }}
        onPress={() => void history.restore(item.id)} style={[styles.restore, { backgroundColor: c.soft }]}>
        {history.restoring === item.id ? <ActivityIndicator color={c.accent} /> :
          <Text style={{ color: c.accent, fontWeight: '700' }}>{item.recoverable ? 'Restore' : 'Recovery period ended'}</Text>}
      </Pressable>
    </> : <View style={styles.metadata}><Text style={[styles.detail, { color: c.muted }]}>{flowieDate(item.last_message_at ?? item.created_at)}</Text>
      <Text style={[styles.status, { color: c.accent, backgroundColor: c.soft }]}>{item.status === 'active' ? 'Active' : 'Ended'}</Text></View>}
  </View>;
  return <><Head><title>{title} | LifeFlow</title></Head><Stack.Screen options={{ headerShown: false, title }} />
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace(deleted ? '/flowie-history' : '/flowie')}>
          <MaterialIcons name="arrow-back" size={24} color={c.text} /></Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{title}</Text>
      </View>
      <FlatList style={styles.list} data={history.items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.content}
        refreshing={history.ready && history.loading} onRefresh={history.refresh}
        renderItem={({ item }) => deleted ? card(item) : <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + item.title}
          onPress={() => router.push({ pathname: '/flowie-conversation/[id]', params: { id: String(item.id) } })}>{card(item)}</Pressable>}
        ListHeaderComponent={<>
          {!deleted ? <>
            <FlowieManagementActions onEnded={history.refresh} />
            <View style={styles.historyHeading}>
              <Text accessibilityRole="header" style={[styles.historyTitle, { color: c.text }]}>Conversation History</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Recently Deleted" style={[styles.deletedButton, { backgroundColor: c.soft }]}
                onPress={() => router.push('/flowie-recently-deleted')}><Text style={[styles.deletedText, { color: c.accent }]}>Recently Deleted</Text></Pressable>
            </View>
          </> : null}
          {history.notice ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: c.accent }]}>{history.notice}</Text> : null}
          {history.error ? <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: c.text }}>{history.error}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry history" disabled={history.loading || history.restoring !== null}
              style={styles.textButton} onPress={history.refresh}><Text style={{ color: c.accent }}>Retry</Text></Pressable></View> : null}
        </>}
        ListEmptyComponent={!history.ready && !history.error ? <TabSkeleton /> :
          !history.error ? <Text style={[styles.empty, { color: c.muted }]}>{deleted ? 'Recently Deleted is empty.' : 'No conversations yet. Your Flowie chats will appear here.'}</Text> : null}
        ListFooterComponent={<>
          {history.more && history.ready ? <Pressable accessibilityRole="button" accessibilityLabel="Load more conversations"
            disabled={history.loading || history.restoring !== null} style={styles.textButton} onPress={history.loadMore}>
            {history.loading ? <ActivityIndicator color={c.accent} /> : <Text style={{ color: c.accent }}>Load more</Text>}</Pressable> : null}
          {deleted && history.notice ? <Pressable accessibilityRole="button" style={styles.textButton}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/flowie-history')}><Text style={{ color: c.accent }}>View Conversation History</Text></Pressable> : null}
        </>} />
    </SafeAreaView>
  </>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 21, fontWeight: '800', lineHeight: 28 },
  list: { flex: 1 }, managementActions: { marginBottom: 20 },
  endButton: { minHeight: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 12 },
  endText: { fontSize: 15, fontWeight: '700', textAlign: 'center' }, disabled: { opacity: 0.5 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  historyTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  deletedButton: { minHeight: 44, borderRadius: 14, paddingHorizontal: 12, justifyContent: 'center' },
  deletedText: { fontSize: 12, fontWeight: '700' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, flexGrow: 1 },
  card: { borderRadius: 22, borderWidth: 1, padding: 18, marginBottom: 12, gap: 10 },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700' }, detail: { fontSize: 13, lineHeight: 20 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  status: { fontSize: 12, fontWeight: '600', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  restore: { minHeight: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 12 },
  textButton: { minHeight: 44, padding: 12, justifyContent: 'center', alignItems: 'center' },
  feedback: { paddingVertical: 12 }, empty: { paddingVertical: 28, fontSize: 15, lineHeight: 23, textAlign: 'center' },
});

import { ConfirmationModal } from '@/components/confirmation-modal';
import { FlowieActionCard, FlowieMessageBubble, QuickPromptChip, UserMessageBubble, useFlowieColors } from '@/components/flowie-components';
import { TabSkeleton } from '@/components/tab-skeleton';
import { useFlowieConversation } from '@/hooks/use-flowie-conversation';
import { FLOWIE_INTRO, QUICK_PROMPTS, flowieAction, type FlowieActionType, type FlowieMessage } from '@/services/flowie-preview';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function FlowieConversationScreen({ conversationId }: { conversationId?: number }) {
  const router = useRouter();
  const chat = useFlowieConversation(conversationId);
  const c = useFlowieColors();
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = useRef<FlatList<FlowieMessage>>(null);
  const scrollRequested = useRef(false), nearBottom = useRef(true);
  const lastPrompt = useRef({ text: '', at: 0 });
  const ended = chat.conversation?.status === 'ended';
  const canCompose = chat.ready && !ended && !chat.busy && !chat.loading && !chat.requiresRefresh;
  const messages: FlowieMessage[] = chat.messages.length ? chat.messages :
    chat.ready && !ended ? [{ id: 'intro', role: 'flowie', message: FLOWIE_INTRO }] : [];
  const openAction = (action: FlowieActionType) => {
    const item = flowieAction(action);
    if (item) router.push(item.route);
  };
  const submit = async (text: string) => {
    if (!text.trim() || !canCompose) return;
    scrollRequested.current = true;
    const success = await chat.send(text);
    if (!success && mounted.current && !draftRef.current) { draftRef.current = text; setDraft(text); }
  };
  const send = () => {
    const text = draftRef.current.trim();
    if (!text || !canCompose) return;
    // Consume synchronously: a stale keyboard/button handler cannot send the same draft twice.
    draftRef.current = ''; setDraft('');
    void submit(text);
  };
  const ask = (prompt: string) => {
    if (!canCompose) return;
    const now = Date.now();
    if (lastPrompt.current.text === prompt && now - lastPrompt.current.at < 500) return;
    lastPrompt.current = { text: prompt, at: now };
    void submit(prompt);
  };
  const confirm = async () => {
    if (!confirmDelete) return;
    const success = await chat.remove();
    if (!mounted.current) return;
    setConfirmDelete(false);
    if (success) {
      draftRef.current = ''; setDraft('');
      if (conversationId !== undefined) router.replace('/flowie');
    }
  };
  const startNew = () => {
    draftRef.current = ''; setDraft('');
    if (conversationId !== undefined) router.replace('/flowie');
    else chat.startNew();
  };

  return <><Head><title>Flowie | LifeFlow</title></Head><Stack.Screen options={{ headerShown: false, title: 'Flowie' }} />
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.headerBorder, { borderColor: c.border }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton}
            onPress={() => router.canGoBack() ? router.back() : router.replace(conversationId === undefined ? '/(tabs)' : '/flowie-history')}>
            <MaterialIcons name="arrow-back" size={24} color={c.text} />
          </Pressable>
          <View style={styles.heading}><Text style={[styles.title, { color: c.text }]}>Flowie</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>Blood Donation Assistant</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Manage conversations" style={styles.iconButton} onPress={() => router.push('/flowie-history')}>
            <MaterialIcons name="more-vert" size={24} color={c.text} />
          </Pressable>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.pinnedEvaluation}><FlowieActionCard action="open_evaluation" onAction={openAction} /></View>
        <FlatList ref={list} style={styles.flex} data={messages} keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ListEmptyComponent={!chat.ready && chat.loading ? <TabSkeleton /> : null}
          ListFooterComponent={<>
            {chat.sending ? <View style={styles.feedback} accessibilityLiveRegion="polite">
              <FlowieMessageBubble item={{ id: 'reply-progress', role: 'flowie', message: 'Flowie Thinking...' }} pose="thinking" onAction={openAction} onPrompt={ask} />
            </View> : null}
            {chat.error ? <View style={styles.feedback}>
              <Text accessibilityRole="alert" style={{ color: c.text }}>{chat.error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh conversation" disabled={chat.busy || chat.loading}
                style={styles.textButton} onPress={() => void chat.refresh()}><Text style={{ color: c.accent }}>Refresh conversation</Text></Pressable>
            </View> : null}
          </>}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => item.role === 'user' ? <UserMessageBubble message={item.message} /> : <FlowieMessageBubble item={item} onAction={openAction} onPrompt={ask} />}
          onScroll={({ nativeEvent: e }) => { nearBottom.current = e.contentSize.height - e.contentOffset.y - e.layoutMeasurement.height < 90; }}
          scrollEventThrottle={32}
          onContentSizeChange={() => { if (scrollRequested.current || nearBottom.current) { scrollRequested.current = false; list.current?.scrollToEnd({ animated: false }); } }}
          onLayout={() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }} />
        {/* Ended status comes from E1. Retain the transcript while hiding all compose controls. */}
        {ended ? <View style={[styles.composerBorder, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={styles.composerWidth}>
            <Text accessibilityRole="header" style={[styles.endedTitle, { color: c.text }]}>Conversation Ended</Text>
            <Text style={{ color: c.muted }}>This conversation is saved in your history.</Text>
            <View style={styles.endedActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Start New Conversation" disabled={chat.busy}
                onPress={startNew} style={[styles.primaryButton, { backgroundColor: c.primary }]}><Text style={[styles.buttonText, { color: c.white }]}>Start New Conversation</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete this Conversation" disabled={chat.busy || chat.loading}
                style={[styles.textButton, styles.centeredAction]} onPress={() => setConfirmDelete(true)}>
                <Text style={{ color: c.accent }}>Delete this Conversation</Text></Pressable>
            </View>
          </View>
        </View> : <View style={[styles.composerBorder, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={styles.composerWidth}>
            <View style={styles.chips}>{QUICK_PROMPTS.map(prompt => <QuickPromptChip key={prompt} label={prompt} onPress={ask} disabled={!canCompose} />)}</View>
            <View style={styles.composerRow}>
              <TextInput accessibilityLabel="Message Flowie" placeholder="Ask Flowie..." placeholderTextColor={c.muted}
                value={draft} editable={chat.ready} multiline maxLength={1000} scrollEnabled textAlignVertical="top"
                onChangeText={value => { draftRef.current = value; setDraft(value); }}
                style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || !canCompose, busy: chat.sending }}
                disabled={!draft.trim() || !canCompose} onPress={send}
                style={({ pressed }) => [styles.send, { backgroundColor: draft.trim() ? c.primary : c.border }, pressed && styles.pressed]}>
                {chat.sending ? <ActivityIndicator color={c.white} /> : <MaterialIcons name="arrow-upward" size={24} color={draft.trim() ? c.white : c.muted} />}
              </Pressable>
            </View>
          </View>
        </View>}
      </KeyboardAvoidingView>
      <ConfirmationModal visible={confirmDelete} title="Delete Conversation"
        message="This conversation will be moved to Recently Deleted for 30 days."
        primaryLabel="Delete" variant="destructive"
        loading={chat.busy} onSecondary={() => setConfirmDelete(false)} onPrimary={confirm} />
    </SafeAreaView>
  </>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, headerBorder: { borderBottomWidth: 1 },
  header: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  heading: { flex: 1, minWidth: 0 }, title: { fontSize: 21, lineHeight: 27, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 }, listContent: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, paddingBottom: 24, flexGrow: 1 },
  pinnedEvaluation: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, separator: { height: 16 }, feedback: { paddingTop: 18, gap: 8 },
  composerBorder: { borderTopWidth: 1 }, composerWidth: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22 },
  send: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  endedTitle: { fontSize: 17, fontWeight: '700' }, endedActions: { alignItems: 'center', paddingTop: 8, gap: 4 }, centeredAction: { alignItems: 'center' },
  primaryButton: { maxWidth: '100%', minHeight: 48, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '700', fontSize: 15, textAlign: 'center' }, textButton: { minHeight: 44, paddingVertical: 12, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});

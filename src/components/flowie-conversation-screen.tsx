import { ConfirmationModal } from '@/components/confirmation-modal';
import { FlowieActionCard, FlowieMessageBubble, QuickPromptChip, UserMessageBubble, useFlowieColors } from '@/components/flowie-components';
import { TabSkeleton } from '@/components/tab-skeleton';
import { useFlowieConversation } from '@/hooks/use-flowie-conversation';
import { FLOWIE_INTRO, QUICK_PROMPTS, flowieAction, type FlowieActionType, type FlowieMessage } from '@/services/flowie-preview';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function FlowieConversationScreen({ conversationId }: { conversationId?: number }) {
  const router = useRouter();
  const chat = useFlowieConversation(conversationId);
  const c = useFlowieColors();
  const { height = 640 } = useWindowDimensions();
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = useRef<FlatList<FlowieMessage>>(null);
  const following = useRef(true);
  const userScrolling = useRef(false);
  const momentumFromDrag = useRef(false);
  const focused = useRef(false);
  const ready = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const scrollVersion = useRef(0);
  const geometry = useRef({ height: 0, content: 0, offset: 0, lastTarget: null as number | null });
  const placement = useRef<{ kind: 'initial' | 'send' | 'latest'; baseline?: number; wait?: boolean } | null>({ kind: 'initial' });
  const [showLatest, setShowLatest] = useState(false);
  const [latestHeight, setLatestHeight] = useState(44);
  const [quickQuestionsFor, setQuickQuestionsFor] = useState<string | null>(null);
  const conversationKey = `${conversationId ?? 'active'}:${chat.id ?? 'new'}`;
  const quickExpanded = quickQuestionsFor === conversationKey;
  const updateLatestControl = useCallback(() => {
    const { content, height, offset } = geometry.current;
    setShowLatest(ready.current && !following.current && height > 0 && content - height > 140 && offset > 64);
  }, []);
  const adjustTranscript = useCallback(() => {
    if (!focused.current || !ready.current || userScrolling.current || scrollFrame.current !== null) return;
    const version = scrollVersion.current;
    scrollFrame.current = requestAnimationFrame(() => {
      if (version !== scrollVersion.current) return;
      scrollFrame.current = null;
      if (!mounted.current || !focused.current || !ready.current || userScrolling.current) return;
      updateLatestControl();
      const metrics = geometry.current;
      if (!following.current || metrics.height <= 0 || metrics.content <= 0) return;
      // The inverted transcript starts at its newest rows. Older row measurements never move this anchor.
      const target = 0;
      if ((metrics.lastTarget === null && Math.abs(metrics.offset) < 2) || metrics.lastTarget === target) {
        placement.current = null; return;
      }
      // Wait for the optimistic message's measured content, not the pre-send composer resize.
      if (placement.current?.wait && placement.current.baseline === metrics.content) return;
      const animated = placement.current?.kind === 'send' || placement.current?.kind === 'latest';
      metrics.lastTarget = target;
      list.current?.scrollToOffset({ offset: target, animated });
      placement.current = null;
    });
  }, [updateLatestControl]);
  const returnToLatest = () => {
    userScrolling.current = false; momentumFromDrag.current = false; following.current = true;
    placement.current = { kind: 'latest' }; geometry.current.lastTarget = null;
    setShowLatest(false); adjustTranscript();
  };
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setQuickQuestionsFor(null); adjustTranscript();
    return () => {
      focused.current = false;
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    };
  }, [adjustTranscript]));
  const previousConversation = useRef({ target: conversationId, id: chat.id });
  useLayoutEffect(() => {
    const previous = previousConversation.current;
    // Assigning the first server ID acknowledges this chat; it must not override a donor's scroll-up.
    if ((!ready.current && chat.ready) || previous.target !== conversationId || (previous.id !== undefined && previous.id !== chat.id)) {
      scrollVersion.current++;
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
      if (previous.target !== conversationId) geometry.current = { height: 0, content: 0, offset: 0, lastTarget: null };
      userScrolling.current = false; momentumFromDrag.current = false; setShowLatest(false);
      following.current = true; geometry.current.lastTarget = null; placement.current = { kind: 'initial' };
    }
    previousConversation.current = { target: conversationId, id: chat.id };
    ready.current = chat.ready;
    adjustTranscript();
  }, [conversationId, chat.id, chat.ready, adjustTranscript]);
  const isCurrentView = () => mounted.current && previousConversation.current.target === conversationId && previousConversation.current.id === chat.id;
  const trackReadingPosition = ({ nativeEvent: event }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isCurrentView()) return;
    const metrics = geometry.current;
    metrics.offset = event.contentOffset.y;
    // Acknowledge completed native movement; a rapid resize can then replace an older queued target.
    if (metrics.lastTarget !== null && Math.abs(metrics.lastTarget - metrics.offset) < 2) metrics.lastTarget = null;
    if (userScrolling.current) {
      const distance = Math.max(0, event.contentOffset.y);
      // Separate exit/return thresholds avoid toggling follow mode around a single boundary.
      if (distance > 140) following.current = false;
      else if (distance < 64) following.current = true;
    }
    updateLatestControl();
  };
  const beginReading = () => {
    if (!isCurrentView()) return;
    userScrolling.current = true; momentumFromDrag.current = true; placement.current = null; geometry.current.lastTarget = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
  };
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
    setQuickQuestionsFor(null); userScrolling.current = false; momentumFromDrag.current = false; following.current = true; setShowLatest(false);
    placement.current = { kind: 'send', baseline: geometry.current.content, wait: true }; geometry.current.lastTarget = null;
    const success = await chat.send(text);
    if (mounted.current && placement.current?.kind === 'send') { placement.current.wait = false; adjustTranscript(); }
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
        <View style={styles.transcript}>
        <FlatList key={conversationId ?? 'active'} ref={list} style={styles.flex} inverted data={[...messages].reverse()} keyExtractor={item => item.id}
          maintainVisibleContentPosition={showLatest ? { minIndexForVisible: 0 } : undefined}
          contentContainerStyle={[styles.listContent, showLatest && { paddingTop: latestHeight + 24 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ListEmptyComponent={!chat.ready && chat.loading ? <View><TabSkeleton /></View> : null}
          ListHeaderComponent={<>
            {chat.sending ? <View style={styles.feedback} accessibilityLiveRegion="polite">
              <FlowieMessageBubble item={{ id: 'reply-progress', role: 'flowie', message: 'Flowie Thinking...' }} pose="thinking" onAction={openAction} onPrompt={ask} />
            </View> : null}
            {chat.error ? <View style={styles.feedback}>
              <Text accessibilityRole="alert" style={{ color: c.danger }}>{chat.error}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh conversation" disabled={chat.busy || chat.loading}
                style={styles.textButton} onPress={() => void chat.refresh()}><Text style={{ color: c.accent }}>Refresh conversation</Text></Pressable>
            </View> : null}
          </>}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => item.role === 'user' ? <UserMessageBubble message={item.message} /> : <FlowieMessageBubble item={item} onAction={openAction} onPrompt={ask} />}
          onScrollBeginDrag={beginReading}
          onScroll={trackReadingPosition}
          onScrollEndDrag={event => { if (isCurrentView()) { trackReadingPosition(event); userScrolling.current = false; } }}
          onMomentumScrollBegin={() => { if (isCurrentView() && momentumFromDrag.current) userScrolling.current = true; }}
          onMomentumScrollEnd={event => { if (isCurrentView()) { trackReadingPosition(event); userScrolling.current = false; momentumFromDrag.current = false; } }}
          scrollEventThrottle={32}
          onContentSizeChange={(_, content) => {
            if (!isCurrentView()) return;
            if (geometry.current.content === content) return;
            geometry.current.content = content;
            adjustTranscript();
          }}
          onLayout={({ nativeEvent }) => {
            if (!isCurrentView()) return;
            if (geometry.current.height === nativeEvent.layout.height) return;
            geometry.current.height = nativeEvent.layout.height;
            adjustTranscript();
          }} />
        {chat.ready && showLatest ? <Pressable accessibilityRole="button" accessibilityLabel="Latest Messages, return to newest messages"
          onLayout={({ nativeEvent }) => setLatestHeight(Math.ceil(nativeEvent.layout.height))}
          onPress={returnToLatest} style={({ pressed }) => [styles.latestButton, { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.text }, pressed && styles.pressed]}>
          <Text style={[styles.latestLabel, { color: c.accent }]}>Latest Messages</Text>
          <MaterialIcons name="arrow-downward" size={18} color={c.accent} accessible={false} />
        </Pressable> : null}
        </View>
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
                <Text style={{ color: c.danger }}>Delete this Conversation</Text></Pressable>
            </View>
          </View>
        </View> : <View style={[styles.composerBorder, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={styles.composerWidth}>
            <Pressable accessibilityRole="button" accessibilityLabel="Quick Questions"
              accessibilityState={{ expanded: quickExpanded, disabled: !chat.ready }} disabled={!chat.ready}
              onPress={() => {
                if (!chat.ready) return;
                if (!quickExpanded) Keyboard.dismiss();
                setQuickQuestionsFor(current => current === conversationKey ? null : conversationKey);
              }} style={({ pressed }) => [styles.quickToggle, pressed && styles.pressed]}>
              <MaterialIcons name="help-outline" size={20} color={c.accent} accessible={false} />
              <Text style={[styles.quickLabel, { color: c.accent }]}>Quick Questions</Text>
              <MaterialIcons name={quickExpanded ? 'keyboard-arrow-down' : 'chevron-right'} size={22} color={c.accent} accessible={false} />
            </Pressable>
            {quickExpanded ? <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(160, height * 0.2) }} contentContainerStyle={styles.chips}>
              {QUICK_PROMPTS.map(prompt => <QuickPromptChip key={prompt} label={prompt} onPress={ask} disabled={!canCompose} />)}
            </ScrollView> : null}
            <View style={styles.composerRow}>
              <TextInput accessibilityLabel="Message Flowie" placeholder="Ask Flowie..." placeholderTextColor={c.muted}
                value={draft} editable={chat.ready} multiline maxLength={1000} scrollEnabled textAlignVertical="top"
                onFocus={() => setQuickQuestionsFor(null)}
                onChangeText={value => { draftRef.current = value; setDraft(value); setQuickQuestionsFor(null); }}
                style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || !canCompose, busy: chat.sending }}
                disabled={!draft.trim() || !canCompose} onPress={send}
                style={({ pressed }) => [styles.send, { backgroundColor: draft.trim() ? c.primary : c.border }, pressed && styles.pressed]}>
                {chat.sending ? <ActivityIndicator color={c.white} /> : <MaterialIcons name="send" size={24} color={draft.trim() ? c.white : c.muted} />}
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
  screen: { flex: 1 }, flex: { flex: 1, minHeight: 0 }, headerBorder: { borderBottomWidth: 1 },
  transcript: { flex: 1, minHeight: 0, position: 'relative' },
  latestButton: { position: 'absolute', bottom: 8, alignSelf: 'center', maxWidth: '90%', minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 3, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4 },
  latestLabel: { fontSize: 13, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  header: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  heading: { flex: 1, minWidth: 0 }, title: { fontSize: 21, lineHeight: 27, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 }, listContent: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, paddingTop: 24, flexGrow: 1, justifyContent: 'flex-end' },
  pinnedEvaluation: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, separator: { height: 16 }, feedback: { paddingTop: 18, gap: 8 },
  quickToggle: { minHeight: 44, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickLabel: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  composerBorder: { borderTopWidth: 1 }, composerWidth: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22 },
  send: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  endedTitle: { fontSize: 17, fontWeight: '700' }, endedActions: { alignItems: 'center', paddingTop: 8, gap: 4 }, centeredAction: { alignItems: 'center' },
  primaryButton: { maxWidth: '100%', minHeight: 48, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '700', fontSize: 15, textAlign: 'center' }, textButton: { minHeight: 44, paddingVertical: 12, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});

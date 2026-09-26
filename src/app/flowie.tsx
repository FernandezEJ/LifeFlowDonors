import { useAuth } from '@/contexts/auth-context';
import type { FlowieHistoryEntry } from '@/services/flowie-chat';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlowieActionCard, FlowieMessageBubble, QuickPromptChip, UserMessageBubble, useFlowieColors } from '@/components/flowie-components';
import { FLOWIE_INTRO, QUICK_PROMPTS, flowieAction, localFlowieResponse, type FlowieActionType, type FlowieMessage, type FlowieResponse } from '@/services/flowie-preview';

// ========================================
// LOCAL CONVERSATION SESSION
// Transient chat text goes through Laravel; no profile or assessment data is sent.
// Local actions stay allowlisted. Flowie never mutates donor records.
// ========================================
export default function FlowieScreen() {
  const router = useRouter();
  const { flowieChat } = useAuth();
  const c = useFlowieColors();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<FlowieMessage[]>([{ id: 'intro', role: 'flowie', message: FLOWIE_INTRO }]);
  const [replyState, setReplyState] = useState<'default' | 'thinking' | 'writing'>('default');
  const replying = useRef(false);
  const [replyError, setReplyError] = useState('');
  const pendingReply = useRef<{ id: number; text: string; history: FlowieHistoryEntry[] } | null>(null);
  const generation = useRef(0);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (replyTimer.current !== null) clearTimeout(replyTimer.current);
    replying.current = false;
    generation.current++;
  }, []);
  const draftRef = useRef('');
  const sequence = useRef(0);
  const lastPrompt = useRef({ text: '', at: 0 });
  const list = useRef<FlatList<FlowieMessage>>(null);
  const scrollRequested = useRef(false);
  const nearBottom = useRef(true);

  // ========================================
  // SAFE SHORTCUTS AND DUPLICATE-SEND PROTECTION
  // Navigation uses a controlled action map. Consuming the draft synchronously
  // prevents stale button/keyboard callbacks from sending the same draft twice.
  // ========================================
  const openAction = (action: FlowieActionType) => {
    const item = flowieAction(action);
    if (item) router.push(item.route);
  };
  const answer = (pending: { id: number; text: string; history: FlowieHistoryEntry[] }) => {
    if (replying.current) return;
    replying.current = true;
    setReplyError('');
    setReplyState('thinking');
    const version = ++generation.current;
    const finish = (response: FlowieResponse) => {
      if (version !== generation.current) return;
      setReplyState('writing');
      replyTimer.current = setTimeout(() => {
        if (version !== generation.current) return;
        scrollRequested.current = true;
        setMessages(previous => [...previous, { id: 'flowie-' + pending.id, role: 'flowie', ...response }]);
        pendingReply.current = null;
        replyTimer.current = null;
        replying.current = false;
        setReplyState('default');
      }, 400);
    };
    const local = localFlowieResponse(pending.text);
    if (local) {
      replyTimer.current = setTimeout(() => finish(local), 1200);
    } else {
      void flowieChat(pending.text, pending.history).then(result => finish({ message: result.reply, source: 'ai' })).catch(() => {
        if (version !== generation.current) return;
        replying.current = false;
        setReplyState('default');
        setReplyError('Flowie could not reply right now. Please try again.');
        scrollRequested.current = true;
      });
    }
  };
  const append = (text: string) => {
    if (replying.current) return;
    const id = ++sequence.current;
    const history: FlowieHistoryEntry[] = messages.filter(item => item.id !== 'intro').slice(-6)
      .map(item => ({ role: item.role === 'user' ? 'user' : 'assistant', text: item.message }));
    const pending = { id, text, history };
    pendingReply.current = pending;
    scrollRequested.current = true;
    setMessages(previous => [...previous, { id: 'user-' + id, role: 'user', message: text }]);
    answer(pending);
  };
  const send = () => {
    const text = draftRef.current.trim();
    if (!text || replying.current) return;
    draftRef.current = ''; setDraft('');
    append(text);
  };
  const ask = (prompt: string) => {
    if (replying.current) return;
    const now = Date.now();
    if (lastPrompt.current.text === prompt && now - lastPrompt.current.at < 500) return;
    lastPrompt.current = { text: prompt, at: now };
    append(prompt);
  };

  // ========================================
  // FIXED HEADER, SCROLLING CHAT AND KEYBOARD-SAFE COMPOSER
  // Safe-area edges protect system bars. The composer stays outside the list,
  // and layout changes only follow the bottom when the donor was already there.
  // ========================================
  return <><Stack.Screen options={{ headerShown: false }} />
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.headerBorder, { borderColor: c.border }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <MaterialIcons name="arrow-back" size={24} color={c.text} />
          </Pressable>
          <View style={styles.heading}><Text style={[styles.title, { color: c.text }]}>Flowie</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>Blood Donation Assistant</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" style={styles.iconButton} onPress={() => openAction('open_notifications')}>
            <MaterialIcons name="notifications-none" size={24} color={c.text} />
          </Pressable>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Pinned shortcut is a sibling of the list, so long chats cannot scroll it away. */}
        <View style={styles.pinnedEvaluation}><FlowieActionCard action="open_evaluation" onAction={openAction} /></View>
        <FlatList ref={list} style={styles.flex} data={messages} keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          ListFooterComponent={replyState !== 'default' ? <View style={{ paddingTop: 18 }} accessibilityLiveRegion="polite">
            <FlowieMessageBubble item={{ id: 'reply-progress', role: 'flowie', message: replyState === 'thinking' ? 'Flowie Thinking...' : 'Flowie Writing...' }} pose={replyState} onAction={openAction} onPrompt={ask} />
          </View> : replyError ? <View style={{ paddingTop: 18 }}>
            <Text accessibilityRole="alert" style={{ color: c.text }}>{replyError}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry Flowie reply" style={styles.iconButton}
              onPress={() => { if (pendingReply.current) answer(pendingReply.current); }}><Text style={{ color: c.accent }}>Retry</Text></Pressable>
          </View> : null}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => item.role === 'user' ? <UserMessageBubble message={item.message} /> : <FlowieMessageBubble item={item} onAction={openAction} onPrompt={ask} />}
          onScroll={({ nativeEvent: e }) => { nearBottom.current = e.contentSize.height - e.contentOffset.y - e.layoutMeasurement.height < 90; }}
          scrollEventThrottle={32}
          onContentSizeChange={() => { if (scrollRequested.current) { scrollRequested.current = false; list.current?.scrollToEnd({ animated: true }); } }}
          onLayout={() => { if (sequence.current > 0 && nearBottom.current) list.current?.scrollToEnd({ animated: false }); }} />
        <View style={[styles.composerBorder, { borderColor: c.border, backgroundColor: c.surface }]}>
          <View style={styles.composerWidth}>
            {/* Three fixed questions share the composer's keyboard-safe utility area. */}
            <View style={styles.chips}>{QUICK_PROMPTS.map(prompt => <QuickPromptChip key={prompt} label={prompt} onPress={ask} disabled={replyState !== 'default'} />)}</View>
            <View style={styles.composerRow}>
              <TextInput accessibilityLabel="Message Flowie" placeholder="Ask Flowie..." placeholderTextColor={c.muted}
                value={draft} multiline maxLength={1000} scrollEnabled textAlignVertical="top"
                onChangeText={value => { draftRef.current = value; setDraft(value); }}
                style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || replyState !== 'default' }}
                disabled={!draft.trim() || replyState !== 'default'} onPress={send}
                style={({ pressed }) => [styles.send, { backgroundColor: draft.trim() ? c.primary : c.border }, pressed && styles.pressed]}>
                <MaterialIcons name="arrow-upward" size={24} color={draft.trim() ? c.white : c.muted} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </>;
}

// ========================================
// RESPONSIVE LIFEFLOW LAYOUT
// Compact pinned controls and a flexible list prioritize conversation on narrow phones.
// ========================================
const styles = StyleSheet.create({
  screen: { flex: 1 }, flex: { flex: 1 }, headerBorder: { borderBottomWidth: 1 },
  header: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  heading: { flex: 1, minWidth: 0 }, title: { fontSize: 21, lineHeight: 27, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 }, listContent: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, paddingBottom: 24 },
  pinnedEvaluation: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, separator: { height: 18 },
  composerBorder: { borderTopWidth: 1 }, composerWidth: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 9, paddingBottom: 10, gap: 7 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22 },
  send: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});

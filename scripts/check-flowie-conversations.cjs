/* E2 and post-E3 revisions: execute production services, hooks and screen handlers with E1-shaped responses.
 * No real donor data, database resets, provider calls or automatic mail are used. */
const assert = require('node:assert/strict'), fs = require('node:fs');
const { load, host, flush, nodes, texts, native, shared, flushFrames, animationFrames, emitKeyboard, keyboardListenerCount } = require('./flowie-test-boundaries.cjs');
const preview = load('src/services/flowie-preview.ts');
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
const page = (data, current = 1, last = 1) => ({ data, current_page: current, last_page: last, total: data.length });
const meta = (id, status = 'active') => ({ id, title: 'Donation chat ' + id, status, created_at: '2026-10-01T01:00:00Z', updated_at: '2026-10-01T01:00:00Z', last_message_at: '2026-10-01T01:00:00Z', ended_at: status === 'ended' ? '2026-10-01T02:00:00Z' : null });
const record = (id, role, content) => ({ id, role, content, created_at: '2026-10-01T01:00:00Z' });
const calls = []; let responder;
const service = load('src/services/flowie-chat.ts', { './api': { ApiError, errorMessage: e => e.message, apiRequest: async (path, options) => { calls.push({ path, options }); return responder(path, options); } }, './flowie-preview': preview });
let cases = 0;
const check = async (name, fn) => { await fn(); cases++; console.log('PASS: ' + name); };
(async () => {
await check('all authenticated E1 endpoints, verbs, pagination and optional conversation_id', async () => {
  responder = (path, opts) => path === '/flowie/chat' ? { reply: 'Actual reply', conversation_id: 3 } :
    path.includes('?page=') && !/conversations\/3/.test(path) ? page([meta(3)], 2, 3) :
    path.includes('?page=') ? { conversation: meta(3), messages: page([record(1, 'user', 'Question')]) } :
    { message: 'Done', conversation: meta(3, 'ended') };
  const result = await service.requestFlowieChat('donor-token', 'Question', Array.from({ length: 9 }, () => ({ role: 'user', text: 'Previous' })), 3);
  assert.equal(result.conversation_id, 3); assert.equal(calls[0].options.body.history.length, 6);
  assert.equal(calls[0].options.timeoutMs, 40000); assert.equal(calls[0].options.body.conversation_id, 3);
  await service.requestFlowieChat('donor-token', 'New', []); assert.ok(!('conversation_id' in calls[1].options.body));
  await service.flowieApi.history('donor-token', 2); await service.flowieApi.deleted('donor-token', 2);
  await service.flowieApi.detail('donor-token', 3); await service.flowieApi.end('donor-token', 3);
  await service.flowieApi.remove('donor-token', 3); await service.flowieApi.restore('donor-token', 3);
  assert.equal(calls[2].path, '/flowie/conversations?page=2');
  assert.equal(calls[3].path, '/flowie/conversations/recently-deleted?page=2');
  assert.equal(calls[4].path, '/flowie/conversations/3?page=1');
  assert.equal(calls[5].path, '/flowie/conversations/3/end'); assert.equal(calls[5].options.method, 'POST');
  assert.equal(calls[6].path, '/flowie/conversations/3'); assert.equal(calls[6].options.method, 'DELETE');
  assert.equal(calls[7].path, '/flowie/conversations/3/restore');
  assert.ok(calls.every(c => c.options.token === 'donor-token'));
  assert.ok(calls.slice(5).every(c => c.options.body === undefined));
  await assert.rejects(service.flowieApi.detail('donor-token', -1), { status: 422 });
  responder = () => ({ reply: 'Unconfirmed' }); await assert.rejects(service.requestFlowieChat('donor-token', 'Test', []), /confirm/);
});
await check('active discovery across history pages, chronological paginated messages, deduplication and safe shortcut hints', async () => {
  const reads = [];
  const reader = {
    flowieHistory: async n => { reads.push(['history', n]); return n === 1 ? page([meta(7, 'ended')], 1, 2) : page([meta(3)], 2, 2); },
    flowieDetail: async (id, n) => { reads.push([id, n]); return { conversation: meta(id), messages: n === 1 ? page([record(2, 'assistant', 'Groq text'), record(1, 'user', 'My status')], 1, 2) : page([record(2, 'assistant', 'Groq text'), record(3, 'user', 'Next')], 2, 2) }; },
  };
  const result = await service.findActiveFlowie(reader);
  assert.deepEqual(reads, [['history', 1], ['history', 2], [3, 1], [3, 2]]);
  assert.deepEqual(Array.from(result.messages, m => m.id), [1, 2, 3]);
  const display = service.flowieDisplayMessages(result.messages);
  assert.equal(display[1].message, 'Groq text'); assert.equal(display[1].source, 'ai');
  assert.equal(display[1].action.type, 'open_status'); assert.ok(!display.some(m => m.id === 'intro'));
  const empty = await service.findActiveFlowie({ ...reader, flowieHistory: async () => page([meta(7, 'ended')]) });
  assert.equal(empty.conversation, null); assert.equal(empty.messages.length, 0);
});
function backend() {
  let conversations = [meta(3), meta(7, 'ended')], messages = { 3: [record(1, 'user', 'Saved question'), record(2, 'assistant', 'Saved answer')], 7: [record(9, 'assistant', 'Ended answer')] };
  let next = 10, fail = false, failReads = false, gate = null, historyGate = null;
  const calls = [];
  const auth = {
    user: { id: 1 },
    flowieHistory: async n => { calls.push(['history', n]); if (historyGate) return historyGate; if (failReads) throw new Error('History offline'); return page(conversations.filter(c => !c.deleted_at)); },
    flowieDeleted: async n => { calls.push(['deleted', n]); return page(conversations.filter(c => c.deleted_at)); },
    flowieDetail: async id => { calls.push(['detail', id]); if (failReads) throw new Error('Detail offline'); const conversation = conversations.find(c => c.id === id && !c.deleted_at); if (!conversation) throw new ApiError('Not found', 404); return { conversation, messages: page(messages[id]) }; },
    flowieChat: async (text, history, id) => {
      calls.push(['chat', text, history, id]);
      let conversation = id ? conversations.find(c => c.id === id && !c.deleted_at) : conversations.find(c => c.status === 'active' && !c.deleted_at);
      if (!conversation) { conversation = meta(next++); conversations = [conversation, ...conversations]; messages[conversation.id] = []; }
      if (conversation.status === 'ended') throw new ApiError('Ended', 409);
      messages[conversation.id].push(record(next++, 'user', text));
      if (gate) await gate;
      if (fail) throw new ApiError('Unavailable', 503);
      messages[conversation.id].push(record(next++, 'assistant', 'Actual Groq answer to ' + text));
      return { reply: 'Actual Groq answer to ' + text, conversation_id: conversation.id };
    },
    endFlowie: async id => { calls.push(['end', id]); const value = { ...conversations.find(c => c.id === id), status: 'ended', ended_at: '2026-10-03T00:00:00Z' }; conversations = conversations.map(c => c.id === id ? value : c); return { conversation: value }; },
    deleteFlowie: async id => { calls.push(['delete', id]); const value = { ...conversations.find(c => c.id === id), deleted_at: '2026-10-03T00:00:00Z', permanent_delete_at: '2026-11-02T00:00:00Z', days_remaining: 30, recoverable: true }; conversations = conversations.map(c => c.id === id ? value : c); return { conversation: value }; },
    restoreFlowie: async id => { calls.push(['restore', id]); const value = { ...conversations.find(c => c.id === id), status: 'ended', deleted_at: undefined }; conversations = conversations.map(c => c.id === id ? value : c); return { conversation: value }; },
  };
  return { auth, calls, setFail: value => { fail = value; }, setFailReads: value => { failReads = value; }, setGate: value => { gate = value; }, setHistoryGate: value => { historyGate = value; } };
}
function conversationHost(b, id, activeOnly = false) {
  const h = host();
  const hook = load('src/hooks/use-flowie-conversation.ts', { react: h.react, 'expo-router': { useFocusEffect: h.focus }, '@/contexts/auth-context': { useAuth: () => b.auth }, '@/services/flowie-chat': service, '@/services/api': { ApiError } });
  return { ...h, view: () => h.render(() => hook.useFlowieConversation(id, { activeOnly })) };
}
let b = backend(), h = conversationHost(b);
await check('initial skeleton readiness, existing active hydration and no duplicate intro', async () => {
  assert.equal(h.view().ready, false); await flush();
  assert.equal(h.view().id, 3); assert.deepEqual(Array.from(h.view().messages, m => m.message), ['Saved question', 'Saved answer']);
  assert.ok(h.view().ready); assert.ok(!h.view().messages.some(m => m.id === 'intro'));
});
await check('every quick question persists, duplicate send locked, authoritative reply and returned ID', async () => {
  let release; b.setGate(new Promise(resolve => { release = resolve; }));
  const send = h.view().send; const first = send('My status'); const second = send('My status');
  assert.equal(await second, false); assert.equal(h.view().sending, true);
  assert.equal(h.view().messages.at(-1).message, 'My status'); assert.equal(h.view().messages.at(-1).role, 'user');
  release(); await first; h.view();
  assert.equal(b.calls.filter(c => c[0] === 'chat').length, 1);
  assert.equal(b.calls.find(c => c[0] === 'chat')[3], 3);
  assert.equal(h.view().messages.at(-1).message, 'Actual Groq answer to My status');
  assert.equal(h.view().messages.at(-1).action.type, 'open_status');
  assert.ok(b.calls.filter(c => c[0] === 'chat').every(c => c[2].length <= 6));
  b.setGate(null);
});
await check('failed Groq request reconciles saved donor message without a fake assistant; safe explicit retry', async () => {
  b.setFail(true); const count = h.view().messages.length;
  assert.equal(await h.view().send('Failed question'), false); h.view();
  assert.equal(h.view().messages.length, count + 1); assert.equal(h.view().messages.at(-1).role, 'user'); assert.match(h.view().error, /unavailable/);
  b.setFail(false); await h.view().send('Failed question'); h.view(); assert.equal(h.view().messages.at(-1).role, 'flowie');
});
await check('actual reply survives a failed refresh, further sends blocked until confirmed history refresh', async () => {
  b.setFailReads(true); assert.equal(await h.view().send('Accepted answer'), true); h.view();
  assert.equal(h.view().messages.at(-1).message, 'Actual Groq answer to Accepted answer'); assert.equal(h.view().requiresRefresh, true);
  const count = b.calls.filter(c => c[0] === 'chat').length;
  assert.equal(await h.view().send('Do not resend'), false); assert.equal(b.calls.filter(c => c[0] === 'chat').length, count);
  b.setFailReads(false); await h.view().refresh(); h.view(); assert.equal(h.view().requiresRefresh, false);
});
await check('End preserves transcript, blocks append; Start New makes no API create and next send resolves new active', async () => {
  const count = h.view().messages.length;
  await h.view().end(); h.view(); assert.equal(h.view().conversation.status, 'ended'); assert.equal(h.view().messages.length, count);
  assert.equal(await h.view().send('Blocked'), false);
  h.blur(); h.refocus(); await flush(); assert.equal(h.view().conversation.status, 'ended');
  const callCount = b.calls.length; h.view().startNew(); h.view();
  assert.equal(b.calls.length, callCount); assert.equal(h.view().messages.length, 0); assert.equal(h.view().id, undefined);
  await h.view().send('Fresh question'); h.view(); assert.notEqual(h.view().id, 3);
  assert.equal(b.calls.filter(c => c[0] === 'chat').at(-1)[3], undefined);
});
await check('soft delete resets current view and excludes history, no hard delete or Delete Now', async () => {
  const id = h.view().id; await h.view().remove(); h.view();
  assert.equal(h.view().messages.length, 0); assert.equal(h.view().id, undefined);
  assert.ok(!(await b.auth.flowieHistory()).data.some(c => c.id === id));
  assert.ok((await b.auth.flowieDeleted()).data.some(c => c.id === id));
});
await check('management End is reflected on returning to chat; management rediscovers a newly active chat on focus', async () => {
  const donor = backend(), main = conversationHost(donor), management = conversationHost(donor, undefined, true);
  main.view(); management.view(); await flush(); main.view(); management.view();
  const saved = main.view().messages.map(item => item.message);
  main.blur(); await management.view().end(); management.view();
  main.refocus(); await flush(); main.view();
  assert.equal(main.view().conversation.status, 'ended'); assert.deepEqual(main.view().messages.map(item => item.message), saved);
  assert.equal(await main.view().send('Cannot append'), false);
  management.blur(); main.view().startNew(); main.view(); await main.view().send('New active conversation'); main.view();
  const newId = main.view().id; assert.notEqual(newId, 3);
  management.refocus(); await flush(); management.view();
  assert.equal(management.view().id, newId); assert.equal(management.view().conversation.status, 'active');
  main.unmount(); management.unmount();
});
await check('ended detail is read-only while an active detail composes', async () => {
  const ended = conversationHost(b, 7); ended.view(); await flush(); assert.equal(ended.view().conversation.status, 'ended');
  assert.equal(ended.view().messages[0].message, 'Ended answer'); assert.equal(await ended.view().send('No'), false); ended.unmount();
  const activeBackend = backend(), active = conversationHost(activeBackend, 3); active.view(); await flush();
  assert.equal(active.view().conversation.status, 'active'); await active.view().send('Yes'); assert.equal(active.view().messages.at(-1).role, 'flowie'); active.unmount();
});
function historyHost(b, deleted) {
  const hoster = host();
  const hook = load('src/hooks/use-flowie-history.ts', { react: hoster.react, 'expo-router': { useFocusEffect: hoster.focus }, '@/contexts/auth-context': { useAuth: () => b.auth }, '@/services/flowie-chat': service });
  return { ...hoster, view: () => hoster.render(() => hook.useFlowieHistory(deleted)) };
}
await check('normal history and Recently Deleted hydrate, restore removes deleted item and backend returns ended history', async () => {
  const normal = historyHost(b, false); assert.equal(normal.view().ready, false); await flush(); assert.ok(normal.view().items.every(c => !c.deleted_at));
  const deleted = historyHost(b, true); deleted.view(); await flush(); assert.equal(deleted.view().items.length, 1);
  const item = deleted.view().items[0]; assert.equal(item.days_remaining, 30); assert.equal(item.permanent_delete_at, '2026-11-02T00:00:00Z');
  await deleted.view().restore(item.id); deleted.view(); assert.equal(deleted.view().items.length, 0); assert.match(deleted.view().notice, /restored/);
  normal.blur(); normal.refocus(); await flush(); assert.equal(normal.view().items.find(c => c.id === item.id).status, 'ended');
  normal.unmount(); deleted.unmount();
});
await check('history pagination, duplicate load-more prevention and refresh retains existing data', async () => {
  const p = backend(); let release, count = 0;
  p.auth.flowieHistory = async n => { count++; return n === 1 ? page([meta(2, 'ended')], 1, 2) : new Promise(resolve => { release = () => resolve(page([meta(1)], 2, 2)); }); };
  const list = historyHost(p, false); list.view(); await flush(); assert.equal(list.view().more, true);
  const more = list.view().loadMore; const pending = more(); more();
  assert.equal(count, 2); assert.equal(list.view().items.length, 1); release(); await pending; list.view();
  assert.deepEqual(Array.from(list.view().items, c => c.id), [2, 1]); assert.equal(list.view().more, false);
  list.unmount();
});
await check('404/409/410/503 failures use safe lifecycle-specific retry/recovery copy', async () => {
  assert.match(service.flowieError(new ApiError('Secret', 404)), /unavailable/);
  assert.match(service.flowieError(new ApiError('Secret', 409)), /Refresh/);
  assert.match(service.flowieError(new ApiError('Secret', 410)), /30-day/);
  assert.match(service.flowieError(new ApiError('Secret', 503)), /unavailable/);
  assert.ok(!service.flowieError(new ApiError('Secret', 409)).includes('Secret'));
});
await check('logout/account switch hides old transcript immediately and discards a pending old reply', async () => {
  const donor = backend(), view = conversationHost(donor); view.view(); await flush(); view.view();
  let release; donor.setGate(new Promise(resolve => { release = resolve; }));
  const pending = view.view().send('Old donor'); view.view(); donor.auth.user = null;
  assert.equal(view.view().messages.length, 0); donor.auth.user = { id: 2 }; donor.setHistoryGate(Promise.resolve(page([])));
  assert.equal(view.view().messages.length, 0); await flush(); view.view();
  release(); await pending; assert.equal(view.view().messages.length, 0); assert.equal(view.view().id, undefined); view.unmount();
});
await check('history cache clears between donors and late responses cannot leak', async () => {
  const donor = backend(), history = historyHost(donor, false); history.view(); await flush(); assert.ok(history.view().items.length);
  history.blur(); let release; donor.setHistoryGate(new Promise(resolve => { release = resolve; })); history.refocus(); history.view();
  donor.auth.user = null; assert.equal(history.view().items.length, 0);
  donor.auth.user = { id: 2 }; donor.setHistoryGate(Promise.resolve(page([]))); history.view(); await flush(); history.view();
  release(page([meta(999)])); await flush(); assert.equal(history.view().items.length, 0); history.unmount();
});
await check('a main chat deleted elsewhere resolves the current chat; unavailable detail cannot keep composing', async () => {
  const donor = backend(), main = conversationHost(donor); main.view(); await flush(); main.view();
  await donor.auth.deleteFlowie(3); await main.view().refresh(); main.view();
  assert.equal(main.view().id, undefined); assert.equal(main.view().messages.length, 0); assert.equal(main.view().ready, true);
  const unavailable = conversationHost(donor, 7); unavailable.view(); await flush(); unavailable.view();
  await donor.auth.deleteFlowie(7); await unavailable.view().refresh(); unavailable.view();
  assert.equal(unavailable.view().ready, false); assert.equal(unavailable.view().messages.length, 0);
  assert.equal(await unavailable.view().send('Unavailable'), false); assert.match(unavailable.view().error, /unavailable/);
  main.unmount(); unavailable.unmount();
});
await check('restore remains locked across navigation and completes without a stuck recovery button', async () => {
  const donor = backend(); await donor.auth.deleteFlowie(3);
  let release, count = 0; const originalRestore = donor.auth.restoreFlowie;
  donor.auth.restoreFlowie = async id => { count++; await new Promise(resolve => { release = resolve; }); return originalRestore(id); };
  const list = historyHost(donor, true); list.view(); await flush(); list.view();
  const restore = list.view().restore; const pending = restore(3); restore(3); assert.equal(count, 1);
  assert.equal(list.view().restoring, 3); list.blur(); list.refocus(); list.view(); restore(3); assert.equal(count, 1);
  release(); await pending; list.view(); assert.equal(list.view().restoring, null); assert.equal(list.view().items.length, 0);
  assert.match(list.view().notice, /restored/); list.unmount();
});
h.unmount();

// Execute screen callbacks separately from hook tests so UI affordances and confirmations are also checked.
const routes = [], router = { push: route => routes.push(route), replace: route => routes.push(route), canGoBack: () => true, back: () => routes.push('back') };
const screenHost = host(); let chatState, resolvesSend, endCalls = 0, deleteCalls = 0; const sent = [];
const fakeChat = { messages: [{ id: '1', role: 'user', message: 'Saved' }], conversation: meta(3), id: 3, ready: true, loading: false, busy: false, sending: false, error: '',
  send: async text => { sent.push(text); return new Promise(resolve => { resolvesSend = resolve; }); }, refresh: async () => {}, end: async () => { endCalls++; chatState = { ...chatState, conversation: meta(3, 'ended') }; return true; },
  remove: async () => { deleteCalls++; chatState = { ...chatState, id: undefined, conversation: null, messages: [] }; return true; },
  startNew: () => { chatState = { ...chatState, id: undefined, conversation: null, messages: [] }; } };
chatState = fakeChat;
const components = { useFlowieColors: () => ({ background: 'cream', surface: 'white', border: 'border', accent: 'red', primary: 'red' }), FlowieActionCard: 'Evaluation', FlowieMessageBubble: 'Assistant', QuickPromptChip: 'Chip', UserMessageBubble: 'User' };
const screen = load('src/components/flowie-conversation-screen.tsx', { ...shared, react: screenHost.react, 'expo-router': { Stack: { Screen: 'Screen' }, useFocusEffect: screenHost.focus, useRouter: () => router },
  '@/hooks/use-flowie-conversation': { useFlowieConversation: () => chatState }, '@/components/confirmation-modal': { ConfirmationModal: 'Confirmation' },
  '@/components/flowie-components': components, '@/services/flowie-preview': preview });
let target;
const render = () => screenHost.render(() => screen.FlowieConversationScreen({ conversationId: target }));
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const button = (label) => nodes(render()).filter(n => n.type === 'Pressable' && (n.props.accessibilityLabel === label || texts(n).includes(label))).at(-1);
await check('three-dot navigates to full-screen Conversations with no popup, bell or direct active delete', async () => {
  assert.ok(!nodes(render()).some(n => n.props?.name === 'notifications-none' || n.props?.accessibilityLabel === 'Open notifications'));
  button('Manage conversations').props.onPress(); assert.equal(routes.pop(), '/flowie-history');
  assert.ok(!find(render(), 'Modal')); assert.ok(!button('End Conversation')); assert.ok(!button('Delete this Conversation'));
  assert.equal(find(render(), 'Confirmation').props.visible, false);
});
await check('Evaluation and all quick questions navigate/send; input has no plus, handles duplicate stale press and retains failed draft', async () => {
  find(render(), 'Evaluation').props.onAction('open_evaluation'); assert.equal(routes.pop(), '/evaluation');
  find(render(), 'Evaluation').props.onAction('https://evil.test'); assert.equal(routes.length, 0);
  assert.equal(button('Quick Questions').props.accessibilityState.expanded,false);
  assert.equal(nodes(render()).filter(n => n.type === 'Chip').length,0);
  assert.ok(nodes(button('Quick Questions')).some(n=>n.props?.name==='chevron-right'));
  assert.ok(nodes(button('Quick Questions')).some(n=>n.props?.name==='help-outline'));
  button('Quick Questions').props.onPress();
  assert.deepEqual(nodes(render()).filter(n => n.type === 'Chip').map(n => n.props.label), Array.from(preview.QUICK_PROMPTS));
  assert.ok(nodes(button('Quick Questions')).some(n=>n.props?.name==='keyboard-arrow-down'));
  assert.ok(!nodes(render()).some(n => n.props?.name === 'add'));
  assert.equal(find(render(), 'TextInput').props.maxLength, 1000); assert.equal(find(render(), 'TextInput').props.multiline, true);
  find(render(), 'TextInput').props.onChangeText('Question');
  assert.equal(button('Quick Questions').props.accessibilityState.expanded,false);
  const press = button('Send message').props.onPress; press(); press(); assert.deepEqual(sent, ['Question']);
  resolvesSend(false); await flush(); assert.equal(find(render(), 'TextInput').props.value, 'Question');
  chatState = { ...chatState, busy: true, sending: true }; render();
  button('Quick Questions').props.onPress();
  find(render(), 'Chip').props.onPress('My status'); assert.equal(sent.length, 1);
  chatState = { ...chatState, busy: false, sending: false }; render();
  find(render(), 'Chip').props.onPress('My status'); resolvesSend(true); await flush(); assert.equal(sent.at(-1), 'My status');
  assert.equal(button('Quick Questions').props.accessibilityState.expanded,false);
  native.Platform.OS = 'ios'; assert.equal(find(render(), 'KeyboardAvoidingView').props.behavior, 'padding'); native.Platform.OS = 'android';
  assert.equal(find(render(), 'KeyboardAvoidingView').props.behavior, 'height');
});
await check('ended title/message retain normal alignment; only Start New/Delete are centered, transcript stays read-only', async () => {
  chatState = { ...fakeChat, conversation: meta(3, 'ended') };
  assert.ok(texts(render()).includes('Conversation Ended')); assert.ok(!find(render(), 'TextInput')); assert.ok(!button('End Conversation'));
  assert.equal(button('Quick Questions'),undefined);
  assert.equal(find(render(), 'FlatList').props.data[0].message, 'Saved'); assert.ok(button('Delete this Conversation'));
  assert.ok(!button('View Conversation History'));
  const title = nodes(render()).find(n => n.type === 'Text' && n.props.children === 'Conversation Ended');
  assert.notEqual(title.props.style[0].textAlign, 'center');
  const composer = nodes(render()).find(n => n.type === 'View' && n.props.children?.some?.(child => child?.props?.children === 'Conversation Ended'));
  assert.notEqual(composer.props.style.alignItems, 'center');
  const actions = composer.props.children[2]; assert.equal(actions.props.style.alignItems, 'center');
  assert.equal(actions.props.children[0].props.accessibilityLabel, 'Start New Conversation');
  assert.equal(actions.props.children[1].props.accessibilityLabel, 'Delete this Conversation');
  assert.equal(actions.props.children[1].props.style[1].alignItems, 'center');
  button('Start New Conversation').props.onPress();
  assert.ok(find(render(), 'TextInput')); assert.equal(find(render(), 'FlatList').props.data.length, 1);
  assert.equal(find(render(), 'FlatList').props.data[0].message, preview.FLOWIE_INTRO);
});
await check('ended Delete requires shared confirmation; Cancel has no API call; confirmed soft-delete uses 30 days', async () => {
  chatState = { ...fakeChat, conversation: meta(3, 'ended') }; target = 3; render();
  await find(render(), 'Confirmation').props.onPrimary(); assert.equal(deleteCalls, 0);
  button('Delete this Conversation').props.onPress(); assert.equal(deleteCalls, 0);
  find(render(), 'Confirmation').props.onSecondary(); assert.equal(deleteCalls, 0); assert.equal(find(render(), 'Confirmation').props.visible, false);
  button('Delete this Conversation').props.onPress();
  assert.equal(find(render(), 'Confirmation').props.primaryLabel, 'Delete'); assert.match(find(render(), 'Confirmation').props.message, /30 days/);
  await find(render(), 'Confirmation').props.onPrimary(); assert.equal(deleteCalls, 1); assert.equal(routes.pop(), '/flowie');
  chatState = { ...fakeChat, conversation: meta(3, 'ended') }; render(); button('Start New Conversation').props.onPress(); assert.equal(routes.pop(), '/flowie');
  button('Go back').props.onPress(); assert.equal(routes.pop(), 'back'); router.canGoBack = () => false;
  button('Go back').props.onPress(); assert.equal(routes.pop(), '/flowie-history'); router.canGoBack = () => true;
});
await check('initial chat skeleton only, background messages stay, explicit retry and Flowie document title', async () => {
  chatState = { ...fakeChat, ready: false, loading: true, messages: [] }; const initial = find(render(), 'FlatList').props;
  assert.equal(initial.data.length, 0); assert.ok(find(initial.ListEmptyComponent, 'TabSkeleton'));
  chatState = { ...fakeChat, loading: true }; assert.equal(find(render(), 'FlatList').props.data[0].message, 'Saved');
  chatState = { ...fakeChat, error: 'Offline' }; assert.ok(nodes(find(render(), 'FlatList').props.ListHeaderComponent).some(n => n.props?.accessibilityLabel === 'Refresh conversation'));
  assert.equal(find(render(), 'title').props.children, 'Flowie | LifeFlow');
});
screenHost.unmount();
await check('Phase E Quick Questions is collapsed per entry, accessible, wrapping, typing/prompt collapsed and absent when ended', async () => {
  const uiHost=host();let state={...fakeChat,send:async value=>{prompts.push(value);return true;}};const prompts=[];
  const module=load('src/components/flowie-conversation-screen.tsx',{...shared,react:uiHost.react,
    'expo-router':{Stack:{Screen:'Screen'},useFocusEffect:uiHost.focus,useRouter:()=>router},
    '@/hooks/use-flowie-conversation':{useFlowieConversation:()=>state},'@/components/confirmation-modal':{ConfirmationModal:'Confirmation'},
    '@/components/flowie-components':components,'@/services/flowie-preview':preview});
  const view=()=>uiHost.render(()=>module.FlowieConversationScreen({conversationId:3}));
  const toggle=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='Quick Questions');
  const chipNodes=()=>nodes(view()).filter(n=>n.type==='Chip');
  assert.equal(toggle().props.accessibilityRole,'button');assert.equal(toggle().props.accessibilityState.expanded,false);assert.equal(chipNodes().length,0);
  assert.ok(toggle().props.style({pressed:false})[0].minHeight>=44);assert.ok(nodes(toggle()).some(n=>n.props?.name==='chevron-right'&&n.props.accessible===false));
  assert.ok(nodes(toggle()).some(n=>n.props?.name==='help-outline'));
  toggle().props.onPress();assert.equal(toggle().props.accessibilityState.expanded,true);assert.ok(nodes(toggle()).some(n=>n.props?.name==='keyboard-arrow-down'));
  assert.deepEqual(chipNodes().map(n=>n.props.label),Array.from(preview.QUICK_PROMPTS));
  const quickScroll=find(view(),'ScrollView');assert.equal(quickScroll.props.contentContainerStyle.flexWrap,'wrap');assert.ok(quickScroll.props.style.maxHeight<=160);
  toggle().props.onPress();assert.equal(chipNodes().length,0);toggle().props.onPress();find(view(),'TextInput').props.onFocus();assert.equal(chipNodes().length,0);
  toggle().props.onPress();find(view(),'TextInput').props.onChangeText('Draft\nsecond line');assert.equal(chipNodes().length,0);assert.equal(find(view(),'TextInput').props.value,'Draft\nsecond line');
  toggle().props.onPress();const prompt=chipNodes()[0];prompt.props.onPress(prompt.props.label);prompt.props.onPress(prompt.props.label);await flush();
  assert.deepEqual(prompts,[preview.QUICK_PROMPTS[0]]);assert.equal(chipNodes().length,0);assert.equal(find(view(),'TextInput').props.value,'Draft\nsecond line');
  toggle().props.onPress();uiHost.blur();assert.equal(keyboardListenerCount(),0);uiHost.refocus();assert.equal(toggle().props.accessibilityState.expanded,false);
  state={...state,conversation:meta(3,'ended')};assert.equal(toggle(),undefined);assert.ok(!find(view(),'TextInput'));
  assert.equal(find(view(),'FlatList').props.data[0].message,'Saved');uiHost.unmount();assert.equal(keyboardListenerCount(),0);assert.equal(animationFrames.size,0);
});
function scrollingFixture(initial={...fakeChat}) {
  const uiHost=host();let state=initial,content=0,height=0,target;const scrolls=[];
  const module=load('src/components/flowie-conversation-screen.tsx',{...shared,react:uiHost.react,
    'expo-router':{Stack:{Screen:'Screen'},useFocusEffect:uiHost.focus,useRouter:()=>router},
    '@/hooks/use-flowie-conversation':{useFlowieConversation:()=>state},'@/components/confirmation-modal':{ConfirmationModal:'Confirmation'},
    '@/components/flowie-components':components,'@/services/flowie-preview':preview});
  const view=()=>uiHost.render(()=>module.FlowieConversationScreen({conversationId:target}));const transcript=()=>find(view(),'FlatList');
  const event=offset=>({nativeEvent:{contentOffset:{y:offset},layoutMeasurement:{height},contentSize:{height:content}}});
  transcript().props.ref.current={scrollToOffset:options=>{assert.equal(options.offset,0);scrolls.push(options.animated);},scrollToEnd:()=>assert.fail('A saved transcript must not seek an estimated end')};
  return {view,transcript,scrolls,input:()=>find(view(),'TextInput'),
    latest:()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='Latest Messages, return to newest messages'),
    toggle:()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='Quick Questions'),
    update:patch=>{state={...state,...patch};return view();},
    route:(value,patch)=>{target=value;state={...state,...patch};return view();},
    layout:value=>{height=value;transcript().props.onLayout({nativeEvent:{layout:{height,width:360}}});},
    content:value=>{content=value;transcript().props.onContentSizeChange(360,content);},
    scroll:offset=>transcript().props.onScroll(event(offset)),
    drag:offset=>{transcript().props.onScrollBeginDrag();transcript().props.onScroll(event(offset));transcript().props.onScrollEndDrag(event(offset));},
    momentum:offset=>{transcript().props.onMomentumScrollBegin();transcript().props.onScroll(event(offset));transcript().props.onMomentumScrollEnd(event(offset));},
    settleBottom:()=>transcript().props.onScroll(event(0)),
    blur:uiHost.blur,refocus:uiHost.refocus,close:uiHost.unmount};
}
await check('hotfix: a long asynchronously hydrated chat opens at the native newest anchor without measurement-driven bottom seeking', async () => {
  const messages=Array.from({length:500},(_,i)=>({id:String(i+1),role:i%2?'flowie':'user',message:('Variable-height message '+i+' ').repeat(1+(i%17))}));
  const original=JSON.stringify(messages);
  const ui=scrollingFixture({...fakeChat,id:undefined,conversation:null,ready:false,loading:true,messages:[]});
  ui.layout(420);ui.content(260);flushFrames();assert.deepEqual(ui.scrolls,[]);
  await Promise.resolve();ui.update({id:42,conversation:meta(42),ready:true,loading:false,messages});
  // These are the successive spacer/row measurements emitted while a long list virtualizes.
  for(const height of [8500,13890,22760,31000,31240,31318,31318]){
    ui.content(height);flushFrames();ui.view();
    assert.deepEqual(ui.scrolls,[],'Initial history must not walk through estimated bottom offsets');
    assert.ok(!ui.latest(),'Latest Messages must not flash during initial placement');
  }
  assert.equal(ui.transcript().props.inverted,true);
  assert.equal(ui.transcript().props.data[0].id,'500');assert.equal(ui.transcript().props.data.at(-1).id,'1');
  assert.equal(JSON.stringify(messages),original,'Only presentation order changes; saved history is untouched');
  assert.equal(ui.transcript().props.keyExtractor(ui.transcript().props.data[0]),'500');
  assert.equal(ui.transcript().props.disableVirtualization,undefined);assert.equal(ui.transcript().props.getItemLayout,undefined);
  ui.blur();ui.refocus();flushFrames();ui.content(31800);flushFrames();assert.deepEqual(ui.scrolls,[],'Repeated focus/late measurements stay at the initial anchor');
  ui.close();assert.equal(animationFrames.size,0);
});
await check('hotfix: switching long conversations cancels queued placement and ignores old layout, gesture and frame callbacks', async () => {
  const messages=id=>Array.from({length:200},(_,i)=>({id:id+'-'+i,role:'user',message:'Saved message '.repeat(1+i%11)}));
  const ui=scrollingFixture({...fakeChat,messages:messages(3)});
  ui.route(3,{});ui.layout(420);ui.content(15000);flushFrames();ui.drag(800);assert.ok(ui.latest());
  const old=ui.transcript().props;ui.latest().props.onPress();
  const staleFrame=[...animationFrames.values()][0];assert.equal(typeof staleFrame,'function');
  ui.route(8,{id:undefined,conversation:null,ready:false,loading:true,messages:[]});
  assert.equal(animationFrames.size,0);assert.ok(!ui.latest());
  ui.layout(380);ui.content(250);await Promise.resolve();
  ui.update({id:8,conversation:meta(8),ready:true,loading:false,messages:messages(8)});ui.content(19000);
  const queued=animationFrames.size;assert.equal(queued,1);
  staleFrame();old.onContentSizeChange(360,22000);old.onLayout({nativeEvent:{layout:{height:100}}});
  old.onScrollBeginDrag();old.onScroll({nativeEvent:{contentOffset:{y:9000}}});old.onMomentumScrollBegin();old.onMomentumScrollEnd({nativeEvent:{contentOffset:{y:9000}}});
  assert.equal(animationFrames.size,queued,'A stale frame cannot clear the new conversation frame');
  flushFrames();assert.deepEqual(ui.scrolls,[]);assert.ok(!ui.latest());assert.equal(ui.transcript().props.data[0].id,'8-199');
  for(const height of [19800,21000,21050]){ui.content(height);flushFrames();assert.ok(!ui.latest());}
  assert.deepEqual(ui.scrolls,[]);ui.drag(600);assert.ok(ui.latest());
  const closed=ui.transcript().props;ui.latest().props.onPress();ui.close();
  closed.onContentSizeChange(360,23000);closed.onLayout({nativeEvent:{layout:{height:500}}});closed.onScrollBeginDrag();
  flushFrames();assert.deepEqual(ui.scrolls,[]);assert.equal(animationFrames.size,0);
});
await check('hotfix: empty, failed, retried and interrupted hydration never hides the transcript or loses recovery UI', async () => {
  const ui=scrollingFixture({...fakeChat,id:undefined,conversation:null,ready:false,loading:true,messages:[]});
  ui.layout(0);ui.content(0);assert.ok(find(ui.transcript().props.ListEmptyComponent,'TabSkeleton'));flushFrames();
  ui.update({loading:false,error:'Offline'});
  assert.ok(nodes(ui.transcript().props.ListHeaderComponent).some(n=>n.props?.accessibilityLabel==='Refresh conversation'));
  assert.ok(nodes(ui.transcript().props.ListHeaderComponent).some(n=>n.props?.accessibilityRole==='alert'));
  assert.equal(ui.transcript().props.style.opacity,undefined);assert.equal(ui.transcript().props.accessibilityElementsHidden,undefined);
  ui.update({loading:true,error:''});ui.layout(400);ui.content(220);flushFrames();
  await Promise.resolve();ui.update({ready:true,loading:false,messages:[]});ui.content(180);flushFrames();
  assert.equal(ui.transcript().props.data[0].message,preview.FLOWIE_INTRO);assert.ok(!ui.latest());assert.deepEqual(ui.scrolls,[]);
  ui.close();assert.equal(animationFrames.size,0);
});
await check('hotfix: programmatic offsets are not reading intent, and incoming rows retain native history anchoring', async () => {
  const ui=scrollingFixture();ui.layout(400);ui.content(12000);flushFrames();
  ui.scroll(200);assert.ok(!ui.latest(),'A native layout/placement event is not an intentional drag');
  ui.content(12100);flushFrames();assert.deepEqual(ui.scrolls,[false]);ui.settleBottom();
  for(const height of [12500,13000,13010]){ui.content(height);flushFrames();assert.ok(!ui.latest());}
  assert.deepEqual(ui.scrolls,[false],'Late measurements do not restart an acknowledged placement');
  ui.drag(900);const count=ui.scrolls.length;
  ui.update({messages:[...fakeChat.messages,{id:'reply-new',role:'flowie',message:'A new reply with variable height '.repeat(30)}]});
  ui.content(13800);flushFrames();assert.ok(ui.latest());assert.equal(ui.scrolls.length,count);
  assert.equal(ui.transcript().props.data[0].id,'reply-new');
  assert.equal(ui.transcript().props.maintainVisibleContentPosition.minIndexForVisible,0);
  ui.close();
});
await check('Phase E revision: hydrated placement is non-animated; unchanged layout, typing and keyboard events never re-scroll', async () => {
  const ui=scrollingFixture({...fakeChat,id:undefined,conversation:null,ready:false,loading:true,messages:[]});
  ui.layout(400);ui.content(600);flushFrames();assert.deepEqual(ui.scrolls,[],'No scroll through loading placeholders');
  ui.update({id:3,conversation:meta(3),ready:true,loading:false,messages:Array.from({length:60},(_,i)=>({id:String(i+1),role:'user',message:'Saved '+i}))});
  ui.content(2400);ui.layout(400);assert.equal(animationFrames.size,1);flushFrames();assert.deepEqual(ui.scrolls,[]);ui.settleBottom();
  ui.layout(400);ui.content(2400);ui.view();ui.view();ui.input().props.onFocus();
  for(let i=1;i<=20;i++)ui.input().props.onChangeText('Typing a message...'.slice(0,i));
  emitKeyboard('keyboardDidShow');emitKeyboard('keyboardDidHide');emitKeyboard('keyboardDidChangeFrame');flushFrames();
  assert.deepEqual(ui.scrolls,[]);assert.equal(animationFrames.size,0);assert.equal(keyboardListenerCount(),0,'Keyboard spacing is handled by layout, without competing event listeners');
  // The native newest anchor survives viewport changes without corrective bottom searches.
  ui.layout(250);ui.scroll(0);ui.layout(250);ui.content(2400);flushFrames();assert.deepEqual(ui.scrolls,[]);ui.settleBottom();
  ui.layout(250);ui.content(2400);flushFrames();assert.equal(ui.scrolls.length,0);
  ui.layout(220);flushFrames();assert.equal(ui.scrolls.length,0);ui.settleBottom();
  ui.layout(400);flushFrames();ui.settleBottom();assert.equal(ui.scrolls.length,0,'Multiline shrink/grow and keyboard dismissal retain the native anchor');
  ui.layout(250);flushFrames();ui.layout(400);flushFrames();assert.equal(ui.scrolls.length,0,'Rapid reopen/dismiss never repeats placement');ui.settleBottom();
  const count=ui.scrolls.length;ui.toggle().props.onPress();ui.toggle().props.onPress();flushFrames();assert.equal(ui.scrolls.length,count,'Panel toggling alone does not command a scroll');
  assert.ok(!ui.latest());ui.close();assert.equal(animationFrames.size,0);
});
await check('Phase E revision: history intent, momentum and hysteresis; Latest Messages is measured, distinct and resumes following', async () => {
  const ui=scrollingFixture();ui.layout(400);ui.content(2400);flushFrames();ui.settleBottom();
  ui.drag(300);assert.ok(ui.latest());assert.equal(ui.latest().props.accessibilityRole,'button');
  const control=ui.latest(),style=control.props.style({pressed:false})[0];assert.equal(style.position,'absolute');assert.ok(style.minHeight>=44);
  assert.ok(nodes(control).some(n=>n.props?.name==='arrow-downward'&&n.props.accessible===false));
  control.props.onLayout({nativeEvent:{layout:{height:92}}});assert.equal(ui.transcript().props.contentContainerStyle[1].paddingTop,116,'Reserve measured room for larger text at the inverted newest edge');
  assert.equal(ui.transcript().props.maintainVisibleContentPosition.minIndexForVisible,0,'Native anchoring preserves the visible history row when a reply is prepended');
  ui.content(2492);flushFrames();const count=ui.scrolls.length;
  ui.input().props.onFocus();ui.input().props.onChangeText('Still reading');ui.layout(250);ui.content(2692);emitKeyboard('keyboardDidShow');flushFrames();
  assert.equal(ui.scrolls.length,count,'Focus, typing, replies and resizing cannot pull a history reader to the bottom');assert.ok(ui.latest());
  ui.toggle().props.onPress();ui.layout(200);flushFrames();assert.equal(ui.scrolls.length,count);ui.input().props.onFocus();assert.equal(ui.toggle().props.accessibilityState.expanded,false);
  ui.layout(400);ui.drag(170);assert.ok(ui.latest());ui.drag(100);assert.ok(ui.latest(),'Middle hysteresis band retains reading mode');
  ui.drag(50);assert.ok(!ui.latest());ui.drag(100);assert.ok(!ui.latest(),'Middle band does not toggle bottom-follow off');
  ui.drag(170);assert.ok(ui.latest());ui.latest().props.onPress();ui.content(2600);flushFrames();assert.equal(ui.scrolls.length,count+1);assert.equal(ui.scrolls.at(-1),true);ui.settleBottom();assert.ok(!ui.latest());
  assert.equal(ui.transcript().props.maintainVisibleContentPosition,undefined);
  ui.momentum(300);assert.ok(!ui.latest(),'Programmatic animation events do not become donor scroll intent');ui.settleBottom();
  ui.content(2700);flushFrames();assert.equal(ui.scrolls.length,count+1,'Incoming content stays at offset zero without another scroll');ui.settleBottom();
  // A real drag, including its subsequent momentum, stops following and cancels queued work.
  ui.content(2800);const beforeGesture=ui.scrolls.length;ui.drag(2300);ui.momentum(200);flushFrames();assert.equal(ui.scrolls.length,beforeGesture);assert.ok(ui.latest());
  ui.blur();ui.content(3000);emitKeyboard('keyboardDidShow');flushFrames();assert.equal(ui.scrolls.length,beforeGesture);ui.refocus();flushFrames();assert.equal(ui.scrolls.length,beforeGesture,'Returning to a retained chat preserves older-message reading');
  ui.latest().props.onPress();assert.equal(animationFrames.size,1);ui.close();assert.equal(animationFrames.size,0);
});
await check('Phase E revision: sending waits for the new message, uses one intentional animation, and a later scroll-up wins over replies', async () => {
  let release;const sentQuestions=[];const ui=scrollingFixture({...fakeChat,send:value=>{sentQuestions.push(value);return new Promise(resolve=>{release=resolve;});}});
  ui.layout(400);ui.content(2400);flushFrames();ui.settleBottom();ui.drag(300);ui.input().props.onChangeText('Multiple\nlines');
  const send=nodes(ui.view()).find(n=>n.props?.accessibilityLabel==='Send message');assert.ok(nodes(send).some(n=>n.props?.name==='send'));assert.ok(!nodes(send).some(n=>n.props?.name==='arrow-upward'));
  send.props.onPress();send.props.onPress();assert.deepEqual(sentQuestions,['Multiple\nlines']);ui.layout(440);flushFrames();assert.deepEqual(ui.scrolls,[],'Do not first animate to pre-send content on composer resize');
  ui.update({sending:true,busy:true});ui.content(2700);ui.content(2700);flushFrames();assert.deepEqual(ui.scrolls,[true]);ui.settleBottom();
  ui.update({sending:false,busy:false});release(true);await flush();ui.content(2900);flushFrames();assert.deepEqual(ui.scrolls,[true]);ui.settleBottom();
  ui.drag(300);ui.input().props.onChangeText('Second question');nodes(ui.view()).find(n=>n.props?.accessibilityLabel==='Send message').props.onPress();ui.content(3100);flushFrames();ui.settleBottom();
  ui.drag(300);const count=ui.scrolls.length;ui.update({id:3,sending:false,busy:false});release(true);await flush();ui.content(3400);flushFrames();assert.equal(ui.scrolls.length,count);assert.ok(ui.latest());
  assert.equal(ui.scrolls.filter(Boolean).length,2,'At most one animated transition for each explicit send');ui.close();
  // The first returned server conversation ID is not a new navigation command.
  const first=scrollingFixture({...fakeChat,id:undefined,conversation:null});first.layout(300);first.content(1600);flushFrames();first.settleBottom();first.drag(300);
  const before=first.scrolls.length;first.update({id:8,conversation:meta(8)});first.content(1800);flushFrames();assert.equal(first.scrolls.length,before);assert.ok(first.latest());first.close();
});
await check('Phase E revision: short/ended chats, iOS resize, narrow/landscape/font layout and icon clarity', async () => {
  const short=scrollingFixture();short.layout(400);short.content(180);flushFrames();short.drag(0);assert.ok(!short.latest());assert.deepEqual(short.scrolls,[]);
  assert.equal(short.transcript().props.contentContainerStyle[0].justifyContent,'flex-end','Keep short chats at the visual top despite inversion');short.close();
  const originalOS=native.Platform.OS,originalDimensions=native.useWindowDimensions;native.Platform.OS='ios';
  for(const dimensions of [{width:320,height:640,fontScale:2},{width:720,height:320,fontScale:1}]){
    native.useWindowDimensions=()=>dimensions;const ui=scrollingFixture();ui.layout(200);ui.content(1600);flushFrames();ui.settleBottom();
    emitKeyboard('keyboardDidChangeFrame');flushFrames();assert.deepEqual(ui.scrolls,[]);ui.layout(160);flushFrames();assert.deepEqual(ui.scrolls,[]);ui.settleBottom();
    assert.equal(find(ui.view(),'KeyboardAvoidingView').props.behavior,'padding');assert.equal(find(ui.view(),'KeyboardAvoidingView').props.keyboardVerticalOffset,undefined);
    assert.ok(nodes(ui.toggle()).some(n=>n.props?.name==='help-outline'));assert.ok(nodes(ui.toggle()).some(n=>n.props?.name==='chevron-right'));
    ui.toggle().props.onPress();assert.ok(nodes(ui.toggle()).some(n=>n.props?.name==='keyboard-arrow-down'));assert.ok(find(ui.view(),'ScrollView').props.style.maxHeight<=dimensions.height*.2);
    const label=nodes(ui.toggle()).find(n=>n.type==='Text');assert.equal(label.props.style[0].minWidth,0);assert.equal(label.props.numberOfLines,undefined);
    assert.equal(ui.input().props.multiline,true);assert.equal(ui.input().props.style[0].maxHeight,120);
    const send=nodes(ui.view()).find(n=>n.props?.accessibilityLabel==='Send message');assert.ok(nodes(send).some(n=>n.props?.name==='send'));assert.equal(send.props.style({pressed:false})[0].width,48);assert.equal(send.props.style({pressed:false})[0].height,48);
    assert.equal(find(ui.view(),'Evaluation').props.action,'open_evaluation');ui.update({conversation:meta(3,'ended')});assert.ok(!ui.input());assert.ok(!ui.toggle());ui.drag(300);assert.ok(ui.latest(),'Ended history can still return to its latest message');ui.close();
  }
  native.Platform.OS=originalOS;native.useWindowDimensions=originalDimensions;assert.equal(keyboardListenerCount(),0);assert.equal(animationFrames.size,0);
});
await check('full-screen history has top End, history-left/deleted-right, scrolling/pagination, detail and recovery navigation', async () => {
  let restored = null, refreshed = 0, loadedMore = 0;
  const manager = host();
  const state = { items: [meta(3), meta(7, 'ended')], ready: true, loading: false, error: '', notice: '', more: true, restoring: null,
    refresh: async () => { refreshed++; }, loadMore: () => { loadedMore++; }, restore: async id => { restored = id; } };
  const module = load('src/components/flowie-history-screen.tsx', { ...shared, react: manager.react,
    '@/components/confirmation-modal': { ConfirmationModal: 'Confirmation' }, '@/hooks/use-flowie-conversation': { useFlowieConversation: () => chatState },
    '@/components/flowie-components': components, '@/hooks/use-flowie-history': { useFlowieHistory: () => state },
    '@/services/flowie-chat': service, 'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => router } });
  const view = deleted => module.FlowieHistoryScreen({ deleted });
  assert.ok(texts(view(false)).includes('Conversations'));
  const list = find(view(false), 'FlatList').props;
  assert.equal(list.style.flex, 1); assert.deepEqual(list.data.map(item => item.id), [3, 7]);
  const header = list.ListHeaderComponent.props.children[0].props.children;
  assert.equal(header[0].type, module.FlowieManagementActions);
  const heading = header[1]; assert.equal(heading.props.style.flexDirection, 'row');
  assert.equal(heading.props.style.justifyContent, 'space-between'); assert.equal(heading.props.children[0].props.children, 'Conversation History');
  assert.equal(heading.props.children[1].props.accessibilityLabel, 'Recently Deleted');
  assert.ok(!nodes(list.ListFooterComponent).some(n => n.props?.accessibilityLabel === 'Recently Deleted'));
  nodes(list.ListFooterComponent).find(n => n.props?.accessibilityLabel === 'Load more conversations').props.onPress(); assert.equal(loadedMore, 1);
  list.renderItem({ item: state.items[1] }).props.onPress();
  assert.equal(routes.at(-1).pathname, '/flowie-conversation/[id]'); assert.equal(routes.pop().params.id, '7');
  heading.props.children[1].props.onPress(); assert.equal(routes.pop(), '/flowie-recently-deleted');
  nodes(view(true)).find(n => n.props?.accessibilityLabel === 'Go back').props.onPress(); assert.equal(routes.pop(), 'back');
  assert.ok(!nodes(find(view(true), 'FlatList').props.ListHeaderComponent).some(n => n.type === module.FlowieManagementActions));
  // Run the actual top action and shared confirmation; ending never calls delete or discards messages.
  chatState = fakeChat;
  const manage = () => manager.render(() => module.FlowieManagementActions(header[0].props));
  const endButton = () => nodes(manage()).find(n => n.props?.accessibilityLabel === 'End Conversation');
  assert.equal(endButton().props.disabled, false); await find(manage(), 'Confirmation').props.onPrimary(); assert.equal(endCalls, 0);
  endButton().props.onPress(); assert.equal(find(manage(), 'Confirmation').props.visible, true); assert.equal(endCalls, 0);
  assert.match(find(manage(), 'Confirmation').props.message, /still view it later/);
  find(manage(), 'Confirmation').props.onSecondary(); assert.equal(endCalls, 0);
  endButton().props.onPress(); await find(manage(), 'Confirmation').props.onPrimary();
  assert.equal(endCalls, 1); assert.equal(deleteCalls, 1); assert.equal(refreshed, 1);
  assert.equal(chatState.messages[0].message, 'Saved'); assert.equal(endButton().props.disabled, true);
  assert.ok(texts(render()).includes('Conversation Ended'));
  for (const unavailable of [{ ...fakeChat, conversation: null, id: undefined }, { ...fakeChat, ready: false, loading: true }, { ...fakeChat, busy: true }]) {
    chatState = unavailable; assert.equal(endButton().props.disabled, true); endButton().props.onPress(); assert.equal(find(manage(), 'Confirmation').props.visible, false);
  }
  manager.unmount();
  const deleted = { ...meta(9), deleted_at: '2026-10-03T00:00:00Z', permanent_delete_at: '2026-11-02T00:00:00Z', recoverable: true };
  const card = find(view(true), 'FlatList').props.renderItem({ item: deleted });
  assert.match(texts(card).join(' '), /Permanently deletes.*Nov 2, 2026/);
  const restore = nodes(card).find(n => n.props?.accessibilityLabel === 'Restore ' + deleted.title);
  assert.equal(restore.props.disabled, false); await restore.props.onPress(); assert.equal(restored, 9);
  const expired = find(view(true), 'FlatList').props.renderItem({ item: { ...deleted, recoverable: false } });
  assert.equal(nodes(expired).find(n => n.type === 'Pressable').props.disabled, true);
  assert.ok(!texts(view(true)).includes('Delete Now'));
  state.items = []; assert.equal(find(view(true), 'FlatList').props.ListEmptyComponent.props.children, 'Recently Deleted is empty.');
  state.ready = false; assert.ok(find(find(view(true), 'FlatList').props.ListEmptyComponent, 'TabSkeleton'));
});
await check('all Flowie routes registered behind donor session guard; ID validation and route reuse', async () => {
  const layout = fs.readFileSync('src/app/_layout.tsx', 'utf8');
  const protectedSection = layout.slice(layout.indexOf('<Stack.Protected guard={!!user}>'));
  for (const path of ['flowie', 'flowie-history', 'flowie-recently-deleted', 'flowie-conversation/[id]']) {
    assert.ok(protectedSection.includes('name="' + path + '"')); assert.ok(fs.existsSync('src/app/' + path + '.tsx'));
  }
  assert.match(layout, /NotificationProvider key={user\?\.id/);
  let id = '3';
  const module = load('src/app/flowie-conversation/[id].tsx', { ...shared, '@/components/flowie-conversation-screen': { FlowieConversationScreen: 'Chat' }, 'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => router, useLocalSearchParams: () => ({ id }) } });
  assert.equal(find(module.default(), 'Chat').props.conversationId, 3);
  for (id of ['-1', 'bad', '1.5', '999999999999999999999', ['3']]) assert.ok(!find(module.default(), 'Chat'));
});
console.log('Flowie conversation checks passed: ' + cases + ' scenario groups covering E2 and post-E3 revisions, full-screen management, ended alignment/confirmed soft-delete, recovery, pagination and session boundaries.');
})().catch(error => { console.error(error); process.exitCode = 1; });

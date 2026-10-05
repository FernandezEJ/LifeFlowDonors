/* E2 and post-E3 revisions: execute production services, hooks and screen handlers with E1-shaped responses.
 * No real donor data, database resets, provider calls or automatic mail are used. */
const assert = require('node:assert/strict'), fs = require('node:fs');
const { load, host, flush, nodes, texts, native, shared } = require('./flowie-test-boundaries.cjs');
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
const screen = load('src/components/flowie-conversation-screen.tsx', { ...shared, react: screenHost.react, 'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => router },
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
  assert.deepEqual(nodes(render()).filter(n => n.type === 'Chip').map(n => n.props.label), Array.from(preview.QUICK_PROMPTS));
  assert.ok(!nodes(render()).some(n => n.props?.name === 'add'));
  assert.equal(find(render(), 'TextInput').props.maxLength, 1000); assert.equal(find(render(), 'TextInput').props.multiline, true);
  find(render(), 'TextInput').props.onChangeText('Question');
  const press = button('Send message').props.onPress; press(); press(); assert.deepEqual(sent, ['Question']);
  resolvesSend(false); await flush(); assert.equal(find(render(), 'TextInput').props.value, 'Question');
  chatState = { ...chatState, busy: true, sending: true }; render();
  find(render(), 'Chip').props.onPress('My status'); assert.equal(sent.length, 1);
  chatState = { ...chatState, busy: false, sending: false }; render();
  find(render(), 'Chip').props.onPress('My status'); resolvesSend(true); await flush(); assert.equal(sent.at(-1), 'My status');
  native.Platform.OS = 'ios'; assert.equal(find(render(), 'KeyboardAvoidingView').props.behavior, 'padding'); native.Platform.OS = 'android';
  assert.equal(find(render(), 'KeyboardAvoidingView').props.behavior, 'height');
});
await check('ended title/message retain normal alignment; only Start New/Delete are centered, transcript stays read-only', async () => {
  chatState = { ...fakeChat, conversation: meta(3, 'ended') };
  assert.ok(texts(render()).includes('Conversation Ended')); assert.ok(!find(render(), 'TextInput')); assert.ok(!button('End Conversation'));
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
  chatState = { ...fakeChat, error: 'Offline' }; assert.ok(nodes(find(render(), 'FlatList').props.ListFooterComponent).some(n => n.props?.accessibilityLabel === 'Refresh conversation'));
  assert.equal(find(render(), 'title').props.children, 'Flowie | LifeFlow');
});
screenHost.unmount();
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

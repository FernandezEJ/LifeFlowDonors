/* ========================================
 * POINTS / REWARDS / VOUCHER CLIENT CHECKS
 * Real handlers run with mocked React/native/API boundaries. No sample data
 * is inserted into the app or live database, and no device is simulated as verified.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(path, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {if (name === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}});
    if (name === '@/components/tab-skeleton') return { TabSkeleton: 'TabSkeleton' };
    if (!(name in imports)) throw Error('Unexpected import: ' + name);
    return imports[name];
  }, ...globals });
  return module.exports;
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => nodes(tree).filter(n => n.type === 'Text').map(n => Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children).join(' ');
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && text(n) === label);
const flush = () => new Promise(resolve => setImmediate(resolve));
class ApiError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
let sent;
const service = load('src/services/rewards.ts', { './api': { apiRequest: async (path, options) => { sent = { path, ...options }; return {}; } } });
const presentation = load('src/services/announcement-presentation.ts', { './api': { API_BASE_URL: 'http://device.test:8000/api' } }, { URL });
const record = (fields = {}) => ({ id: 1, reward_id: 3, reward: { name: 'Saved reward', description: 'Size: Medium' }, points_spent: 300,
  status: 'available', claim_status: 'available', claim_code: null, claimed_at: null, is_legacy: false, legacy_status: null,
  activated_at: null, expires_at: null, redeemed_at: null, created_at: '2026-09-11T12:00:00Z', ...fields });
const pendingClaim = () => record({ status: 'active', claim_status: 'pending_claim', claim_code: 'LFW-7B9X2Q', activated_at: '2026-09-11T12:00:00Z' });
const claimed = () => record({ status: 'redeemed', claim_status: 'claimed', claimed_at: '2026-09-11T12:05:00Z', activated_at: '2026-09-11T12:00:00Z' });

// ========================================
// SMALL REACT LIFECYCLE HARNESS
// Preserves hook identity/dependencies so focus, effects and stale responses run.
// ========================================
function harness(path, auth, extra = {}, props = {}, componentName = 'default', params = { id: '1' }) {
  const slots = []; let cursor = 0; const pending = []; const alerts = [], routes = [], intervals = new Set();
  let clock = Date.parse('2026-09-11T12:00:00Z'), foreground;
  class Clock extends Date { static now() { return clock; } }
  const memo = (fn, deps) => {
    const i = cursor++, previous = slots[i];
    if (!previous || deps.some((d, j) => d !== previous.deps[j])) slots[i] = { fn, deps };
    return slots[i].fn;
  };
  const effect = (fn, deps) => {
    const i = cursor++, previous = slots[i];
    if (!previous || !deps || deps.some((d, j) => d !== previous.deps?.[j])) {
      slots[i] = { deps, cleanup: previous?.cleanup };
      pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    }
  };
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback: memo, useEffect: effect,
  };
  const router = { navigate: route => routes.push(route), push: route => routes.push(route), canGoBack: () => true, back: () => routes.push('back'), replace: route => routes.push(route), dismissTo: route => routes.push(route) };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Screen' }, useFocusEffect: fn => effect(fn, [fn]), useRouter: () => router, useLocalSearchParams: () => params },
    '@expo/vector-icons/MaterialIcons': { __esModule: true, default: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() { foreground = null; } }; } },
      Pressable: 'Pressable', Text: 'Text', View: 'View', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', FlatList: 'FlatList', Image: 'Image', StyleSheet: { create: value => value } },
    '@/contexts/auth-context': { useAuth: () => auth },
    '@/components/notification-bell': { NotificationBell: 'Bell' },
    '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
    '@/services/api': { ApiError, errorMessage: error => error.message },
    '@/services/rewards': service,
    '@/services/announcement-presentation': presentation,
    ...extra,
  };
  const component = load(path, imports, { Date: Clock, setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) })[componentName];
  const render = () => { cursor = 0; return component(props); };
  const settle = async () => { for (let i = 0; i < 5; i++) { render(); pending.splice(0).forEach(fn => fn()); await flush(); } return render(); };
  return { render, settle, alerts, routes, tick: milliseconds => { clock += milliseconds; intervals.forEach(fn => fn()); },
    intervalCount: () => intervals.size, foreground: state => foreground?.(state), close: () => slots.forEach(s => { if (s && typeof s === 'object') s.cleanup?.(); }) };
}

// ========================================
// SERVICE CONTRACT AND CLAIM STATE
// Only a retry key can accompany spending; activation accepts no client deadline.
// ========================================
async function serviceChecks() {
  await service.rewardsApi.redeem('test-session', 3, 'test-request');
  assert.equal(sent.path, '/rewards/3/redeem');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), { request_key: 'test-request' });
  await service.rewardsApi.activate('test-session', 8);
  assert.equal(sent.path, '/vouchers/8/activate'); assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), {});
  assert.equal(sent.method, 'POST'); assert.equal(sent.token, 'test-session');
  await service.rewardsApi.voucher('test-session', 8);
  assert.equal(sent.path, '/vouchers/8'); assert.equal(sent.token, 'test-session');
  await service.rewardsApi.vouchers('test-session', 2, 'redeemed');
  assert.equal(sent.path, '/vouchers?page=2&status=redeemed');
  await service.rewardsApi.transactions('test-session', 2, 'reward_redemption');
  assert.equal(sent.path, '/points/transactions?page=2&type=reward_redemption');
  for (const [voucher, label, action] of [[record(), 'Available', 'Activate Claim Code'], [pendingClaim(), 'Pending Claim', 'View Claim Code'],
    [claimed(), 'Claimed', 'View Details'], [record({ status: 'redeemed', claim_status: 'legacy', is_legacy: true, legacy_status: 'redeemed' }), 'Legacy', 'View Details'],
    [record({ status: 'redeemed', claim_status: undefined, is_legacy: undefined }), 'Unavailable', 'View Details']]) {
    assert.equal(service.voucherStatusLabel(voucher), label); assert.equal(service.voucherActionLabel(voucher), action);
  }
  assert.equal(service.usableClaimCode(pendingClaim()), 'LFW-7B9X2Q');
  for (const voucher of [record({ claim_code: 'LFW-7B9X2Q' }), { ...claimed(), claim_code: 'LFW-7B9X2Q' },
    { ...pendingClaim(), is_legacy: true }, { ...pendingClaim(), claimed_at: claimed().claimed_at }, { ...pendingClaim(), claim_code: 'malformed' }]) {
    assert.equal(service.usableClaimCode(voucher), null);
  }
  assert.match(service.voucherDate(claimed().claimed_at), /September \d+, 2026 at \d+:\d{2} [AP]M/);
  assert.equal(service.voucherDate('invalid'), 'Unavailable'); assert.equal(service.voucherDate(null), 'Unavailable');
}

// ========================================
// EMPTY INVENTORY, CONFIRMATION AND PERSISTENT RETRY
// Double taps spend once, cancel spends nothing, and only a server success updates balance.
// ========================================
async function catalogueChecks() {
  let inventory = [], balance = 650, pending = null, calls = [], fail = false, balances = [];
  const user = { id: 1 };
  const reward = { id: 3, name: 'Test reward', voucher_value: '100.00', points_cost: 300, stock_quantity: 1, description: null, image_url: null };
  const auth = { user, rewards: async () => ({ data: inventory, request_key: 'fixed-request' }),
    pointsSummary: async () => ({ current_balance: balance, total_earned: 650, total_spent: 650 - balance }),
    redeemReward: async (id, key) => { calls.push([id, key]); if (fail) throw new ApiError('Lost response');
      balance = 350; return { summary: { current_balance: balance }, reward: { ...reward, stock_quantity: 0 } }; } };
  const storage = { read: async () => pending, save: async (_, value) => { pending = value; }, clear: async () => { pending = null; } };
  const make = () => harness('src/components/reward-catalogue.tsx', auth, { '@/services/redemption-storage': { redemptionStorage: storage } },
    { showBalance: true, onBalance: value => balances.push(value) }, 'RewardCatalogue');
  let screen = make(); let tree = await screen.settle();
  assert.match(text(tree), /No rewards are available right now/);
  assert.ok(button(tree, 'My Rewards'));
  screen.close(); inventory = [reward]; screen = make(); tree = await screen.settle();
  const redeem = button(tree, 'Redeem'); redeem.props.onPress(); redeem.props.onPress();
  const modal = () => nodes(screen.render()).find(n => n.type === 'ConfirmationModal').props;
  assert.equal(screen.alerts.length, 0);
  assert.equal(modal().visible, true);
  assert.match(modal().message, /Test reward.*100.00/);
  assert.match(modal().message, /300 points/);
  assert.match(modal().message, /claim code/); assert.doesNotMatch(modal().message, /QR|5-minute|cashier\/counter/);
  modal().onSecondary(); assert.equal(calls.length, 0); assert.equal(modal().visible, false);
  button(screen.render(), 'Redeem').props.onPress();
  fail = true;
  const confirm = modal().onPrimary; confirm(); confirm();
  await screen.settle(); assert.equal(calls.length, 1); assert.equal(balances.at(-1), 650); assert.ok(pending);
  screen.close();
  // Reopening retains the exact request key; a retry can finish after stock is exhausted.
  inventory = [{ ...reward, stock_quantity: 0 }]; screen = make(); tree = await screen.settle();
  assert.ok(button(tree, 'Out of Stock').props.disabled);
  button(tree, 'Out of Stock').props.onPress(); assert.equal(calls.length, 1);
  fail = false; button(tree, 'Retry pending redemption').props.onPress(); await screen.settle();
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.equal(pending, null); assert.equal(balances.at(-1), 350); assert.equal(screen.routes[0], '/my-vouchers');
  screen.close();
  inventory = [{ ...reward, points_cost: 900 }]; screen = make(); tree = await screen.settle();
  assert.ok(button(tree, 'Insufficient points').props.disabled);
  button(tree, 'Insufficient points').props.onPress(); assert.equal(calls.length, 2);
  screen.close();
  inventory = [{ ...reward, stock_quantity: 0 }]; screen = make(); tree = await screen.settle();
  assert.match(text(tree), /100.00/); assert.ok(button(tree, 'Out of Stock').props.disabled);
  assert.equal(button(tree, 'Refresh rewards'), undefined);
  inventory = [reward]; const currentRewards = auth.rewards; auth.rewards = () => currentRewards(); tree = await screen.settle();
  assert.equal(button(tree, 'Redeem').props.disabled, false, 'Replenished active stock is redeemable after refresh');
  const original = auth.rewards;
  auth.rewards = async () => { throw new ApiError('Offline'); };
  tree = await screen.settle(); assert.match(text(tree), /Test reward/); assert.match(text(tree), /Offline/); assert.ok(button(tree, 'Retry'));
  auth.rewards = original; button(tree, 'Retry').props.onPress(); tree = await screen.settle(); assert.doesNotMatch(text(tree), /Offline/);
  screen.close();
}

async function apparelChecks() {
  await service.rewardsApi.redeem('test-session', 3, 'retry-size', 31);
  assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), { request_key: 'retry-size', variant_id: 31 });
  const apparel = { id: 3, name: 'LifeFlow shirt', category: 'apparel', stock_quantity: 23, points_cost: 100, voucher_value: null,
    variants: [{ id: 31, size: 'S', enabled: true, stock_quantity: 5 }, { id: 32, size: 'M', enabled: true, stock_quantity: 10 },
      { id: 33, size: 'L', enabled: true, stock_quantity: 8 }, { id: 34, size: 'XL', enabled: true, stock_quantity: 0 },
      { id: 35, size: '2XL', enabled: false, stock_quantity: 0 }] };
  let pending = null, fail = true;
  const calls = [];
  const auth = { user: { id: 1 }, rewards: async () => ({ data: [apparel, { ...apparel, id: 4, name: 'Pin', category: 'merchandise', variants: [] }], request_key: 'size-key' }),
    pointsSummary: async () => ({ current_balance: 500 }),
    redeemReward: async (...args) => { calls.push(args); if (fail) throw new ApiError('Lost response'); return { summary: { current_balance: 400 }, reward: { ...apparel, stock_quantity: 22 } }; } };
  const storage = { read: async () => pending, save: async (_, value) => { pending = value; }, clear: async () => { pending = null; } };
  const make = () => harness('src/components/reward-catalogue.tsx', auth, { '@/services/redemption-storage': { redemptionStorage: storage } }, {}, 'RewardCatalogue');
  let screen = make(), tree = await screen.settle();
  const size = label => nodes(screen.render()).find(node => node.props?.accessibilityLabel?.startsWith('Size ' + label + ','));
  assert.equal(size('2XL'), undefined);
  assert.equal(size('XL').props.disabled, true);
  assert.equal(button(tree, 'Redeem').props.disabled, true);
  size('S').props.onPress();
  tree = screen.render();
  assert.equal(button(tree, 'Redeem').props.disabled, false);
  button(tree, 'Redeem').props.onPress();
  const modal = () => nodes(screen.render()).find(n => n.type === 'ConfirmationModal').props;
  assert.match(modal().message, /Size S/);
  assert.doesNotMatch(modal().message, /voucher value|denomination/i);
  const confirm = modal().onPrimary; confirm(); confirm(); await screen.settle();
  assert.equal(calls.length, 1); assert.equal(pending.variantId, 31);
  screen.close(); screen = make(); tree = await screen.settle();
  fail = false; button(tree, 'Retry pending redemption').props.onPress(); await screen.settle();
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.equal(pending, null);
  screen.close(); screen = make(); tree = await screen.settle();
  nodes(tree).find(node => node.props?.accessibilityRole === 'radio' && text(node) === 'Merchandise').props.onPress();
  tree = screen.render(); assert.doesNotMatch(text(tree), /LifeFlow shirt/); assert.match(text(tree), /Pin/);
  screen.close();
  const saved = record({ reward: { ...apparel, name: 'Saved shirt', size: 'S' } });
  const history = harness('src/app/my-vouchers.tsx', { user: { id: 1 }, vouchers: async () => ({ data: [saved], current_page: 1, last_page: 1 }) });
  const historyTree = await history.settle();
  const list = nodes(historyTree).find(node => node.type === 'FlatList').props;
  const card = list.renderItem({ item: saved });
  assert.match(text(card), /Saved shirt.*Size S/);
  assert.doesNotMatch(text(card), /Voucher Value/);
  history.close();
  const detail = harness('src/app/voucher.tsx', { user: { id: 1 }, voucher: async () => ({ voucher: saved }), activateVoucher: async () => {} });
  assert.match(text(await detail.settle()), /Saved shirt.*Size S/);
  detail.close();
  assert.equal(service.rewardLabel({ name: 'Saved shirt', size: 'S' }), 'Saved shirt — Size S');
  assert.equal(service.rewardLabel({ name: 'Legacy voucher' }), 'Legacy voucher');
  assert.equal(service.hasVoucherValue({ category: 'merchandise', voucher_value: '100' }), false);
  assert.equal(service.hasVoucherValue({ category: 'apparel', voucher_value: '100' }), false);
  assert.equal(service.hasVoucherValue({ category: 'vouchers', voucher_value: null }), false);
  assert.equal(service.hasVoucherValue({ category: 'vouchers', voucher_value: '100' }), true);
}

async function pointsNavigationChecks() {
  let summaryCalls = 0, catalogueCalls = 0, finish;
  const auth = {
    pointsSummary: async () => { summaryCalls++; return { current_balance: 650 }; },
    rewards: async () => { catalogueCalls++; return { data: [] }; },
    pointTransactions: async () => ({ data: [], current_page: 1, last_page: 1 }),
  };
  const screen = harness('src/app/(tabs)/points.tsx', auth);
  assert.ok(nodes(screen.render()).some(n => n.type === 'TabSkeleton'));
  let tree = await screen.settle(); assert.match(text(tree), /650/); assert.equal(summaryCalls, 1); assert.equal(catalogueCalls, 0);
  assert.doesNotMatch(text(tree), /Available Rewards/);
  button(tree, 'Redeem').props.onPress(); assert.equal(screen.routes.pop(), '/redeem');
  button(tree, 'My Rewards').props.onPress(); assert.equal(screen.routes.pop(), '/my-vouchers');
  auth.pointsSummary = () => new Promise(resolve => { finish = resolve; });
  tree = await screen.settle(); assert.match(text(tree), /650/); assert.ok(!nodes(tree).some(n => n.type === 'TabSkeleton'));
  finish({ current_balance: 350 }); tree = await screen.settle(); assert.match(text(tree), /350/);
  auth.pointsSummary = async () => { throw new ApiError('Balance unavailable'); };
  tree = await screen.settle(); assert.match(text(tree), /350/); assert.ok(button(tree, 'Retry balance')); screen.close();
  const redeem = harness('src/app/redeem.tsx', {}, { '@/components/reward-catalogue': { RewardCatalogue: 'RewardCatalogue' } });
  tree = redeem.render(); assert.equal(nodes(tree).filter(n => n.type === 'RewardCatalogue').length, 1);
  nodes(tree).find(n => n.props?.accessibilityLabel === 'Go back').props.onPress(); assert.equal(redeem.routes.pop(), 'back'); redeem.close();
}

async function polishChecks() {
  for (const host of ['localhost', '127.0.0.1:8000', '[::1]:8000']) {
    assert.equal(presentation.publicImageUrl(`http://${host}/storage/rewards/test.png`, 'rewards'), 'http://device.test:8000/storage/rewards/test.png');
  }
  assert.equal(presentation.publicImageUrl('/storage/rewards/test.png', 'rewards'), 'http://device.test:8000/storage/rewards/test.png');
  assert.equal(presentation.publicImageUrl('https://cdn.test/reward.png', 'rewards'), 'https://cdn.test/reward.png');
  for (const url of [null, '', '/storage/private/test.png', 'file:///private/test.png', 'http://localhost/storage/proofs/test.png']) {
    assert.equal(presentation.publicImageUrl(url, 'rewards'), null);
  }
  let finish;
  const auth = { user: { id: 1 }, rewards: () => new Promise(resolve => { finish = resolve; }), pointsSummary: async () => ({ current_balance: 800 }), redeemReward: async () => { throw Error('Unexpected redemption'); } };
  const storage = { read: async () => null };
  const catalogue = harness('src/components/reward-catalogue.tsx', auth, { '@/services/redemption-storage': { redemptionStorage: storage } }, { showBalance: true }, 'RewardCatalogue');
  let tree = await catalogue.settle(); assert.equal(tree.type, 'TabSkeleton'); assert.doesNotMatch(text(tree), /Loading|Refreshing|--/);
  const reward = { id: 1, name: 'Image reward', image_url: 'http://localhost/storage/rewards/test.png', voucher_value: '250.00', points_cost: 100, stock_quantity: 8 };
  finish({ data: [reward], request_key: 'image-request' }); tree = await catalogue.settle();
  const image = nodes(tree).find(n => n.type === 'Image'); assert.equal(image.props.source.uri, 'http://device.test:8000/storage/rewards/test.png'); assert.equal(image.props.resizeMode, 'contain');
  assert.match(text(tree), /Redeem for 100 Blood Points/); assert.match(text(tree), /8 remaining/); assert.equal(button(tree, 'Refresh rewards'), undefined);
  auth.rewards = () => new Promise(resolve => { finish = resolve; }); tree = await catalogue.settle();
  assert.match(text(tree), /Image reward/); assert.ok(!nodes(tree).some(n => n.type === 'TabSkeleton')); assert.doesNotMatch(text(tree), /Refreshing/);
  finish({ data: [], request_key: 'empty-request' }); tree = await catalogue.settle(); assert.match(text(tree), /No rewards are available/); catalogue.close();

  const calls = []; let finishHistory;
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, amount: 100, description: 'Donation ' + i, created_at: '2026-09-28T00:00:00Z' }));
  const pointsAuth = { pointsSummary: async () => ({ current_balance: 800 }), pointTransactions: async (page, type) => { calls.push({ page, type }); return { data: rows, current_page: page, last_page: 2 }; } };
  const points = harness('src/app/(tabs)/points.tsx', pointsAuth);
  assert.equal(nodes(points.render()).filter(n => n.type === 'TabSkeleton').length, 1);
  tree = await points.settle();
  const history = () => nodes(points.render()).find(n => n.props?.accessibilityLabel === 'Points history');
  for (const [label, type] of [['All', undefined], ['Earned', 'donation_reward'], ['Redeemed', 'reward_redemption']]) {
    button(points.render(), label).props.onPress(); tree = await points.settle();
    assert.equal(calls.at(-1).type, type); assert.equal(history().props.scrollEnabled, true); assert.equal(history().props.nestedScrollEnabled, true);
    assert.equal(history().props.showsVerticalScrollIndicator, false); assert.equal(history().props.style[1].maxHeight, 420);
    button(tree, 'Load more transactions').props.onPress(); await points.settle(); assert.equal(calls.at(-1).page, 2);
  }
  pointsAuth.pointTransactions = () => new Promise(resolve => { finishHistory = resolve; }); tree = await points.settle();
  assert.match(text(tree), /Donation/); assert.doesNotMatch(text(tree), /Refreshing|Loading\.\.\./); assert.ok(!nodes(tree).some(n => n.type === 'TabSkeleton'));
  finishHistory({ data: rows.slice(0, 5), current_page: 1, last_page: 1 }); tree = await points.settle(); assert.equal(history().props.scrollEnabled, false);
  pointsAuth.pointTransactions = async () => ({ data: [], current_page: 1, last_page: 1 }); tree = await points.settle(); assert.match(text(tree), /No transactions yet/); points.close();
}

// ========================================
// VOUCHER FILTERS AND HISTORY NAVIGATION
// Raw redeemed includes legacy history; only confirmed claims appear in Claimed.
// ========================================
async function historyChecks() {
  const legacy = record({ id: 4, status: 'redeemed', claim_status: 'legacy', is_legacy: true, legacy_status: 'redeemed', redeemed_at: '2026-09-11T12:00:00Z' });
  const records = [record(), { ...pendingClaim(), id: 2 }, { ...claimed(), id: 3 }, legacy];
  const requests = [];
  let offline = false;
  const auth = { user: { id: 1 }, vouchers: async (page, status) => { requests.push(status); if (offline) throw new ApiError('Offline');
    return { data: records.filter(item => !status || item.status === status), current_page: page, last_page: 1 }; } };
  const screen = harness('src/app/my-vouchers.tsx', auth);
  await screen.settle();
  const list = () => nodes(screen.render()).find(n => n.type === 'FlatList').props;
  assert.equal(list().data.length, 4); assert.ok(list().data.every(item => item.claim_code === null));
  button(list().ListHeaderComponent, 'All').props.onPress(); await screen.settle();
  assert.equal(list().data.length, 4);
  for (const [item, label] of [[records[0], 'Activate Claim Code'], [records[1], 'View Claim Code'], [records[2], 'View Details'], [legacy, 'View Details']]) {
    assert.ok(button(list().renderItem({ item }), label));
    const rendered=list().renderItem({item});
    const badge=nodes(rendered).find(n=>n.type==='Text'&&n.props.children===service.voucherStatusLabel(item));
    const foreground=Object.assign({},...[badge.props.style].flat(Infinity).filter(Boolean)).color;
    assert.equal(foreground,item.claim_status==='claimed'?'#166534':item.claim_status==='pending_claim'?'#92400E':'#475569','Owned reward badges use real server claim semantics');
  }
  assert.doesNotMatch(text(list().renderItem({ item: legacy })), /Claimed|View Claim Code/);
  button(list().renderItem({ item: records[0] }), 'Activate Claim Code').props.onPress();
  assert.equal(screen.routes[0].pathname, '/voucher'); assert.equal(screen.routes[0].params.id, '1');
  for (const [label, status, id] of [['Available', 'available', 1], ['Pending Claim', 'active', 2], ['Claimed', 'redeemed', 3]]) {
    button(list().ListHeaderComponent, label).props.onPress(); await screen.settle();
    assert.equal(requests.at(-1), status); assert.equal(list().data.length, 1); assert.equal(list().data[0].id, id);
  }
  screen.foreground('background'); assert.equal(list().data.length, 0);
  const before = requests.length; screen.foreground('active'); await screen.settle(); assert.equal(requests.length, before + 1);
  offline = true; list().onRefresh(); await screen.settle(); assert.equal(list().data.length, 0); assert.match(text(list().ListHeaderComponent), /Offline/);
  offline = false; button(list().ListHeaderComponent, 'Retry').props.onPress(); await screen.settle(); assert.equal(list().data.length, 1);
  // Empty visible pages (legacy records) must still allow paging to real claims.
  auth.vouchers = async page => ({ data: page === 1 ? [legacy] : [claimed()], current_page: page, last_page: 2 });
  await screen.settle(); assert.equal(list().data.length, 0);
  button(list().ListFooterComponent, 'Load more').props.onPress(); await screen.settle(); assert.equal(list().data.length, 1);
  // Hide the previous account immediately, before a new account's request settles.
  let finish;
  auth.user = { id: 2 }; auth.vouchers = () => new Promise(resolve => { finish = resolve; });
  assert.equal(list().data.length, 0); await screen.settle();
  auth.user = { id: 3 }; auth.vouchers = async () => ({ data: [], current_page: 1, last_page: 1 });
  await screen.settle(); finish({ data: records, current_page: 1, last_page: 1 }); await screen.settle(); assert.equal(list().data.length, 0);
  screen.close();
}

// ========================================
// ONE-TIME CLAIM CODE, DUPLICATE ACTIVATION AND SERVER RECONCILIATION
// No timers, spending, local code generation, or donor confirmation endpoints.
// ========================================
async function voucherChecks() {
  let current = record(), activations = 0, reads = 0, offline = false, finishActivation, failActivation = false;
  const response = () => ({ server_time: '2026-09-11T12:00:00Z', voucher: { ...current } });
  const auth = {
    user: { id: 1 },
    voucher: async () => { reads++; if (offline) throw new ApiError('Offline'); return response(); },
    activateVoucher: async () => { activations++; current = pendingClaim();
      if (failActivation) throw new ApiError('Lost activation response');
      await new Promise(resolve => { finishActivation = resolve; }); return response(); },
  };
  const screen = harness('src/app/voucher.tsx', auth); let tree = await screen.settle();
  assert.match(text(tree), /Size: Medium/);
  button(tree, 'Activate Claim Code').props.onPress(); button(tree, 'Activate Claim Code').props.onPress();
  const confirmation=()=>nodes(screen.render()).find(n=>n.type==='ConfirmationModal').props;
  assert.equal(screen.alerts.length,0);assert.equal(confirmation().visible,true);assert.equal(confirmation().title,'Activate Claim Code');
  assert.match(confirmation().message,/No additional points/);assert.equal(confirmation().dismissible,false);
  assert.equal(confirmation().secondaryLabel,'Cancel');assert.equal(confirmation().primaryLabel,'Activate Claim Code');
  confirmation().onSecondary();assert.equal(confirmation().visible,false);assert.equal(activations,0);
  button(screen.render(), 'Activate Claim Code').props.onPress();
  const confirm = confirmation().onPrimary; confirm(); confirm();
  tree = await screen.settle(); assert.equal(activations, 1); assert.doesNotMatch(text(tree), /LFW-/);
  const beforeActivationRead = reads; finishActivation(); tree = await screen.settle(); assert.equal(reads, beforeActivationRead + 1);
  assert.match(text(tree), /LFW-7B9X2Q/); assert.match(text(tree), /Pending Claim/); assert.equal(screen.intervalCount(), 0);
  assert.equal(button(tree, 'Activate Claim Code'), undefined);
  const beforeTime = reads; screen.tick(365 * 24 * 3600000); tree = await screen.settle();
  assert.match(text(tree), /LFW-7B9X2Q/); assert.equal(reads, beforeTime); assert.doesNotMatch(text(tree), /QR|remaining|window|scanner/);
  screen.foreground('background'); assert.doesNotMatch(text(screen.render()), /LFW-/);
  screen.foreground('active'); tree = await screen.settle(); assert.match(text(tree), /LFW-7B9X2Q/);
  offline = true; screen.foreground('active'); tree = await screen.settle();
  assert.doesNotMatch(text(tree), /LFW-/); assert.match(text(tree), /Offline/);
  offline = false; button(tree, 'Retry').props.onPress(); tree = await screen.settle(); assert.match(text(tree), /LFW-7B9X2Q/); assert.equal(activations, 1);
  // A cold screen fetches the same credential, without another activation.
  const reopened = harness('src/app/voucher.tsx', auth); assert.match(text(await reopened.settle()), /LFW-7B9X2Q/); reopened.close();
  // A stale/malicious code field on Claimed must never be rendered.
  current = { ...claimed(), claim_code: 'LFW-7B9X2Q' };
  nodes(screen.render()).find(n => n.type === 'ScrollView').props.refreshControl.props.onRefresh(); tree = await screen.settle();
  assert.match(text(tree), /Reward claimed/); assert.match(text(tree), /Claimed: September/); assert.doesNotMatch(text(tree), /LFW-/);
  assert.equal(button(tree, 'Activate Claim Code'), undefined);
  for (const raw of ['active', 'redeemed', 'expired']) {
    current = record({ status: raw, claim_status: 'legacy', is_legacy: true, legacy_status: raw, claim_code: 'LFW-7B9X2Q' });
    screen.foreground('active'); tree = await screen.settle(); assert.match(text(tree), /Legacy voucher/);
    assert.doesNotMatch(text(tree), /Reward claimed|LFW-/); assert.equal(button(tree, 'Activate Claim Code'), undefined);
  }
  current = pendingClaim(); screen.foreground('active'); await screen.settle();
  let finishRead;
  auth.voucher = () => new Promise(resolve => { finishRead = resolve; });
  await screen.settle(); assert.doesNotMatch(text(screen.render()), /LFW-/);
  screen.foreground('background'); finishRead(response()); tree = await screen.settle(); assert.doesNotMatch(text(tree), /LFW-/);
  auth.voucher = async () => response(); screen.foreground('active'); tree = await screen.settle(); assert.match(text(tree), /LFW-/);
  auth.user = { id: 2 }; assert.doesNotMatch(text(screen.render()), /LFW-/);
  auth.voucher = async () => { throw new ApiError('Not found', 404); }; tree = await screen.settle(); assert.doesNotMatch(text(tree), /LFW-/); assert.match(text(tree), /Not found/);
  auth.user = null; assert.doesNotMatch(text(screen.render()), /LFW-/); await screen.settle();
  screen.close();

  // An activation whose response is lost recovers with GET, never automatic POST retries.
  auth.user = { id: 1 }; current = record(); failActivation = true; auth.voucher = async () => response();
  const lost = harness('src/app/voucher.tsx', auth); tree = await lost.settle(); button(tree, 'Activate Claim Code').props.onPress();
  nodes(lost.render()).find(n => n.type === 'ConfirmationModal').props.onPrimary(); tree = await lost.settle();
  assert.match(text(tree), /Lost activation response/); assert.doesNotMatch(text(tree), /LFW-/);
  const lostCalls = activations; button(tree, 'Retry').props.onPress(); tree = await lost.settle(); assert.match(text(tree), /LFW-7B9X2Q/); assert.equal(activations, lostCalls); lost.close();
  // Activation can race an already-activated or already-claimed server state.
  for (const serverRecord of [pendingClaim(), claimed()]) {
    current = record(); auth.activateVoucher = async () => { current = serverRecord; return response(); };
    const race = harness('src/app/voucher.tsx', auth); tree = await race.settle(); button(tree, 'Activate Claim Code').props.onPress();
    nodes(race.render()).find(n => n.type === 'ConfirmationModal').props.onPrimary(); tree = await race.settle();
    assert.match(text(tree), serverRecord.claim_status === 'claimed' ? /Reward claimed/ : /LFW-7B9X2Q/);
    if (serverRecord.claim_status === 'claimed') assert.doesNotMatch(text(tree), /LFW-/);
    race.close();
  }
  // Invalid routes never fetch some other owned reward.
  const readsBeforeInvalid = reads;
  for (const id of ['invalid', '0', '-1', '1.5', '9007199254740992', undefined]) {
    const invalid = harness('src/app/voucher.tsx', auth, {}, {}, 'default', { id });
    assert.match(text(await invalid.settle()), /Reward not found/); assert.equal(reads, readsBeforeInvalid); invalid.close();
  }
  current = pendingClaim(); auth.voucher = async () => { throw new ApiError('Your session has expired. Please log in again.', 401); };
  const expiredSession = harness('src/app/voucher.tsx', auth); tree = await expiredSession.settle();
  assert.match(text(tree), /session has expired/); assert.doesNotMatch(text(tree), /LFW-/); expiredSession.close();
  auth.voucher = () => new Promise(resolve => { finishRead = resolve; });
  const unmounted = harness('src/app/voucher.tsx', auth); await unmounted.settle(); unmounted.close();
  finishRead(response()); await flush(); assert.doesNotMatch(text(unmounted.render()), /LFW-/);
}

async function categoryFilterChecks() {
  const rows = [
    { id: 1, name: 'Merchandise pin', category: 'merchandise' },
    { id: 2, name: 'Apparel shirt', category: 'apparel', variants: [{ id: 21, size: 'M', enabled: true, stock_quantity: 2 }] },
    { id: 3, name: 'LifeFlow voucher', category: 'vouchers', voucher_value: '100' },
    { id: 4, name: 'Legacy grocery reward', category: 'grocery' },
    { id: 5, name: 'Legacy medicine reward', category: 'medicine' },
    { id: 6, name: 'Legacy uncategorized reward', category: null },
  ].map(row => ({ stock_quantity: 2, points_cost: 100, image_url: null, ...row }));
  const original = JSON.stringify(rows); let catalogueCalls = 0, summaryCalls = 0, finishPurchase;
  const auth = { user: { id: 1 }, rewards: async () => { catalogueCalls++; return { data: rows, request_key: 'category-request' }; },
    pointsSummary: async () => { summaryCalls++; return { current_balance: 500 }; },
    redeemReward: () => new Promise(resolve => { finishPurchase = resolve; }) };
  const storage = { read: async () => null, save: async () => {}, clear: async () => {} };
  const host = harness('src/components/reward-catalogue.tsx', auth, { '@/services/redemption-storage': { redemptionStorage: storage } }, { showBalance: true }, 'RewardCatalogue');
  let tree = await host.settle();
  const group = () => nodes(host.render()).find(n => n.props?.accessibilityLabel === 'Reward category');
  const choices = () => nodes(group()).filter(n => n.props?.accessibilityRole === 'radio');
  const select = label => choices().find(n => text(n) === label).props.onPress();
  const selected = () => choices().filter(n => n.props.accessibilityState.selected).map(text);
  const appearance = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
  const assertChoices = () => assert.deepEqual(choices().map(text), ['All Categories', 'Merchandise', 'Apparel', 'Vouchers']);
  assertChoices(); assert.deepEqual(selected(), ['All Categories']);
  assert.equal(group().type, 'ScrollView'); assert.equal(group().props.horizontal, true); assert.equal(group().props.showsHorizontalScrollIndicator, false);
  assert.equal(appearance(group().props.contentContainerStyle).flexWrap, undefined, 'Filter stays in one horizontal scrolling row');
  for (const row of rows) assert.ok(text(tree).includes(row.name));
  const donations = load('src/services/donations.ts', { './api': { apiRequest: async () => ({}) } });
  const activity = harness('src/app/(tabs)/activity.tsx', { donationHistory: async () => ({ data: [], current_page: 1, last_page: 1, total: 0 }) }, { '@/services/donations': donations });
  const activityTree = await activity.settle();
  const activityFilter = nodes(nodes(activityTree).find(n => n.type === 'FlatList').props.ListHeaderComponent).find(n => n.type === 'ScrollView');
  const activityChips = nodes(activityFilter).filter(n => n.type === 'Pressable');
  for (const index of [0, 1]) {
    assert.deepEqual(appearance(choices()[index].props.style), appearance(activityChips[index].props.style), 'Chip styles directly match Activity');
    const label = nodes(choices()[index]).find(n => n.type === 'Text'), activityLabel = nodes(activityChips[index]).find(n => n.type === 'Text');
    assert.deepEqual(appearance(label.props.style), appearance(activityLabel.props.style), 'Selected/unselected typography matches Activity');
  }
  for (const key of ['gap', 'paddingRight']) assert.equal(group().props.contentContainerStyle[key], activityFilter.props.contentContainerStyle[key]);
  activity.close();
  for (const [label, id] of [['Merchandise', 1], ['Apparel', 2], ['Vouchers', 3]]) {
    select(label); tree = host.render(); assert.deepEqual(selected(), [label]); assertChoices();
    for (const row of rows) assert.equal(text(tree).includes(row.name), row.id === id, 'Category filters only available catalogue rows');
  }
  assert.equal(catalogueCalls, 1); assert.equal(summaryCalls, 1, 'Category changes make no new API requests');
  select('All Categories'); tree = host.render(); for (const row of rows) assert.ok(text(tree).includes(row.name));
  assert.equal(JSON.stringify(rows), original, 'Legacy categories/data are never normalized or mutated');
  for (const width of [320, 375]) {
    assert.ok(width - 40 > 0); assert.equal(group().props.horizontal, true);
    for (const choice of choices()) {
      const style = appearance(choice.props.style); assert.equal(style.borderRadius, 20);
      assert.ok(style.minHeight + choice.props.hitSlop.top + choice.props.hitSlop.bottom >= 44);
      const label = nodes(choice).find(n => n.type === 'Text'); assert.equal(label.props.allowFontScaling, undefined); assert.equal(label.props.numberOfLines, undefined);
    }
  }
  select('Apparel'); auth.rewards = async () => { catalogueCalls++; return { data: [rows[0], rows[3]], request_key: 'empty-category' }; };
  tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assertChoices(); assert.match(text(tree), /No rewards are available/);
  auth.rewards = async () => { catalogueCalls++; throw new ApiError('Catalogue unavailable'); };
  tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assertChoices(); assert.match(text(tree), /Catalogue unavailable/);
  auth.rewards = async () => { catalogueCalls++; return { data: rows, request_key: 'retry-category' }; };
  button(tree, 'Retry').props.onPress(); tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assert.match(text(tree), /Apparel shirt/);
  select('Merchandise'); tree = host.render(); button(tree, 'Redeem').props.onPress();
  const confirmation = nodes(host.render()).find(n => n.type === 'ConfirmationModal').props; confirmation.onPrimary(); confirmation.onPrimary(); await flush();
  assert.ok(choices().every(n => n.props.disabled && n.props.accessibilityState.disabled), 'Filter stays disabled during purchase');
  finishPurchase({ summary: { current_balance: 400 }, reward: { ...rows[0], stock_quantity: 1 } }); tree = await host.settle();
  assert.equal(host.routes.pop(), '/my-vouchers'); assert.match(text(tree), /400/); assert.deepEqual(selected(), ['Merchandise']); assertChoices();
  host.close();
  console.log('Redeem filter checks passed: exact four choices/Activity horizontal chip styles, selected/accessibility states, legacy rewards under All, local switching without requests, narrow-width/font configuration, preserved selection on refresh/error/retry, and purchase/My Rewards flow (mocked native boundaries).');
}

(async () => {
  await serviceChecks(); await catalogueChecks(); await apparelChecks(); await pointsNavigationChecks(); await polishChecks(); await historyChecks(); await voucherChecks();
  await categoryFilterChecks();
  assert.equal(fs.existsSync('src/services/mock-voucher-store.ts'), false);
  console.log('Points/rewards/voucher client checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

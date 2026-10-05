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
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
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

// ========================================
// SMALL REACT LIFECYCLE HARNESS
// Preserves hook identity/dependencies so focus, effects and stale responses run.
// ========================================
function harness(path, auth, extra = {}, props = {}, componentName = 'default') {
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
    'expo-router': { Stack: { Screen: 'Screen' }, useFocusEffect: fn => effect(fn, [fn]), useRouter: () => router, useLocalSearchParams: () => ({ id: '1' }) },
    '@expo/vector-icons/MaterialIcons': { __esModule: true, default: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() { foreground = null; } }; } },
      Pressable: 'Pressable', Text: 'Text', View: 'View', ScrollView: 'ScrollView', FlatList: 'FlatList', Image: 'Image', StyleSheet: { create: value => value } },
    '@/contexts/auth-context': { useAuth: () => auth },
    '@/components/notification-bell': { NotificationBell: 'Bell' },
    '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
    '@/services/api': { ApiError, errorMessage: error => error.message },
    '@/services/rewards': service,
    '@/services/announcement-presentation': presentation,
    'react-qr-code': { __esModule: true, default: 'QR' },
    ...extra,
  };
  const component = load(path, imports, { Date: Clock, setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) })[componentName];
  const render = () => { cursor = 0; return component(props); };
  const settle = async () => { for (let i = 0; i < 5; i++) { render(); pending.splice(0).forEach(fn => fn()); await flush(); } return render(); };
  return { render, settle, alerts, routes, tick: milliseconds => { clock += milliseconds; intervals.forEach(fn => fn()); },
    foreground: state => foreground?.(state), close: () => slots.forEach(s => { if (s && typeof s === 'object') s.cleanup?.(); }) };
}

// ========================================
// SERVICE CONTRACT AND AUTHORITATIVE CLOCK
// Only a retry key can accompany spending; activation accepts no client deadline.
// ========================================
async function serviceChecks() {
  await service.rewardsApi.redeem('test-session', 3, 'test-request');
  assert.equal(sent.path, '/rewards/3/redeem');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), { request_key: 'test-request' });
  await service.rewardsApi.activate('test-session', 8);
  assert.equal(sent.path, '/vouchers/8/activate'); assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), {});
  await service.rewardsApi.vouchers('test-session', 2, 'redeemed');
  assert.equal(sent.path, '/vouchers?page=2&status=redeemed');
  await service.rewardsApi.transactions('test-session', 2, 'reward_redemption');
  assert.equal(sent.path, '/points/transactions?page=2&type=reward_redemption');
  const now = Date.parse('2026-09-11T00:00:00Z');
  assert.equal(service.remainingSeconds('2026-09-11T00:05:00Z', 0, now), 300);
  assert.equal(service.remainingSeconds('2026-09-11T00:05:00Z', -3600000, now + 3600000), 300);
  assert.equal(service.remainingSeconds('2026-09-11T00:05:00Z', 0, now + 300000), 0);
  assert.equal(service.formatRemaining(61), '01:01');
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
  assert.ok(button(tree, 'My Vouchers'));
  screen.close(); inventory = [reward]; screen = make(); tree = await screen.settle();
  const redeem = button(tree, 'Redeem'); redeem.props.onPress(); redeem.props.onPress();
  const modal = () => nodes(screen.render()).find(n => n.type === 'ConfirmationModal').props;
  assert.equal(screen.alerts.length, 0);
  assert.equal(modal().visible, true);
  assert.match(modal().message, /Test reward.*100.00/);
  assert.match(modal().message, /300 points/);
  assert.match(modal().message, /cashier\/counter/);
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
  button(tree, 'My Vouchers').props.onPress(); assert.equal(screen.routes.pop(), '/my-vouchers');
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
// All includes redeemed; selecting the current filter must not erase existing cards.
// ========================================
async function historyChecks() {
  const records = [{ id: 1, status: 'redeemed', reward: { name: 'Test' }, points_spent: 300, redeemed_at: '2026-09-11T12:00:00Z' }];
  const requests = [];
  const auth = { vouchers: async (page, status) => { requests.push(status); return { data: status ? [] : records, current_page: page, last_page: 1 }; } };
  const screen = harness('src/app/my-vouchers.tsx', auth);
  await screen.settle();
  const list = () => nodes(screen.render()).find(n => n.type === 'FlatList').props;
  assert.equal(list().data[0].status, 'redeemed');
  button(list().ListHeaderComponent, 'All').props.onPress(); await screen.settle();
  assert.equal(list().data.length, 1);
  button(list().renderItem({ item: records[0] }), 'View Voucher').props.onPress();
  assert.equal(screen.routes[0].pathname, '/voucher'); assert.equal(screen.routes[0].params.id, '1');
  for (const label of ['Available', 'Active', 'Expired']) {
    button(list().ListHeaderComponent, label).props.onPress(); await screen.settle();
    assert.equal(requests.at(-1), label.toLowerCase()); assert.equal(list().data.length, 0);
  }
  screen.close();
}

// ========================================
// WARNING, QR, DUPLICATE ACTIVATION AND SERVER RECONCILIATION
// The code hides on deadline/offline/foreground checking and only server reads redeem it.
// ========================================
async function voucherChecks() {
  const start = '2026-09-11T12:00:00Z', end = '2026-09-11T12:05:00Z';
  let status = 'available', serverTime = start, activations = 0, reads = 0, offline = false;
  const response = () => ({ server_time: serverTime, voucher: { id: 1, reward: { name: 'Test reward' }, points_spent: 300,
    status, qr_token: status === 'active' ? 'opaque-server-token' : null, expires_at: status === 'available' ? null : end,
    activated_at: status === 'available' ? null : start, redeemed_at: status === 'redeemed' ? end : null } });
  const auth = {
    voucher: async () => { reads++; if (offline) throw new ApiError('Offline'); return response(); },
    activateVoucher: async () => { activations++; status = 'active'; return response(); },
  };
  const screen = harness('src/app/voucher.tsx', auth); let tree = await screen.settle();
  assert.equal(nodes(tree).filter(n => n.type === 'QR').length, 0);
  button(tree, 'Activate').props.onPress(); button(tree, 'Activate').props.onPress();
  const confirmation=()=>nodes(screen.render()).find(n=>n.type==='ConfirmationModal').props;
  assert.equal(screen.alerts.length,0);assert.equal(confirmation().visible,true);assert.equal(confirmation().title,'Attention');
  assert.match(confirmation().message,/directly in front of the cashier/);assert.equal(confirmation().dismissible,false);
  assert.equal(confirmation().secondaryLabel,'Cancel');assert.equal(confirmation().primaryLabel,'Activate');
  confirmation().onSecondary();assert.equal(confirmation().visible,false);assert.equal(activations,0);
  button(screen.render(), 'Activate').props.onPress();
  const confirm = confirmation().onPrimary; confirm(); confirm();
  tree = await screen.settle(); assert.equal(activations, 1);
  assert.equal(nodes(tree).find(n => n.type === 'QR').props.value, 'opaque-server-token');
  assert.match(text(tree), /05:00 remaining/);
  screen.tick(120000); tree = await screen.settle(); assert.match(text(tree), /03:00 remaining/);
  screen.foreground('background'); tree = await screen.settle(); assert.equal(nodes(tree).filter(n => n.type === 'QR').length, 0);
  serverTime = '2026-09-11T12:02:00Z'; screen.foreground('active'); tree = await screen.settle();
  assert.match(text(tree), /03:00 remaining/);
  offline = true; screen.tick(180000); tree = await screen.settle();
  assert.equal(nodes(tree).filter(n => n.type === 'QR').length, 0); assert.match(text(tree), /Offline/);
  offline = false; status = 'redeemed'; serverTime = end;
  button(tree, 'Retry').props.onPress(); tree = await screen.settle();
  assert.match(text(tree), /Voucher redeemed/); assert.ok(reads >= 4);
  assert.equal(nodes(tree).filter(n => n.type === 'QR').length, 0);
  screen.close();
}

(async () => {
  await serviceChecks(); await catalogueChecks(); await pointsNavigationChecks(); await polishChecks(); await historyChecks(); await voucherChecks();
  assert.equal(fs.existsSync('src/services/mock-voucher-store.ts'), false);
  console.log('Points/rewards/voucher client checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

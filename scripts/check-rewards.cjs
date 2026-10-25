/* ========================================
 * POINTS / REWARDS / VOUCHER CLIENT CHECKS
 * Real handlers run with mocked React/native/API boundaries. No sample data
 * is inserted into the app or live database, and no device is simulated as verified.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = (type, props) => typeof type === 'function' && ['LoadError', 'EmptyState'].includes(type.name) ? type(props) : ({ type, props });
function load(path, imports, globals = {}) {
  if (!imports['@/components/load-state'] && path !== 'src/components/load-state.tsx' && imports['react/jsx-runtime'] && imports['@expo/vector-icons/MaterialIcons'] && imports.react) imports = { ...imports, '@/components/load-state': load('src/components/load-state.tsx', imports, globals) };
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
const rewardCard = (tree, name) => nodes(tree).find(n => n.type === 'Pressable' && n.props.accessibilityLabel?.startsWith('View reward details: ' + name + ','));
const rewardModal = screen => nodes(screen.render()).find(n => n.type === 'RewardDetailsModal').props;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
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
  const slots = []; let cursor = 0; const pending = []; const alerts = [], routes = [], intervals = new Set(), focusSlots = new Set();
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
    useCallback: memo, useEffect: effect, useLayoutEffect: effect,
  };
  const router = { navigate: route => routes.push(route), push: route => routes.push(route), canGoBack: () => true, back: () => routes.push('back'), replace: route => routes.push(route), dismissTo: route => routes.push(route) };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { Stack: { Screen: 'Screen' }, useFocusEffect: fn => { focusSlots.add(cursor); effect(fn, [fn]); }, useRouter: () => router, useLocalSearchParams: () => params },
    '@expo/vector-icons/MaterialIcons': { __esModule: true, default: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native': { Alert: { alert: (...args) => alerts.push(args) }, AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() { foreground = null; } }; } },
      ActivityIndicator: 'Spinner', Pressable: 'Pressable', Text: 'Text', View: 'View', Modal: 'Modal', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', FlatList: 'FlatList', Image: 'Image', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 360, height: 720, fontScale: 1 }) },
    '@/contexts/auth-context': { useAuth: () => auth },
    '@/components/notification-bell': { NotificationBell: 'Bell' },
    '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
    '@/components/reward-details-modal': { RewardDetailsModal: 'RewardDetailsModal', RewardImage: 'RewardImage' },
    '@/services/api': { ApiError, errorMessage: error => error.message },
    '@/services/rewards': service,
    '@/services/announcement-presentation': presentation,
    ...extra,
  };
  const component = load(path, imports, { Date: Clock, setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) })[componentName];
  const render = () => { cursor = 0; return component(props); };
  const settle = async () => { for (let i = 0; i < 5; i++) { render(); pending.splice(0).forEach(fn => fn()); await flush(); } return render(); };
  return { render, settle, alerts, routes, tick: milliseconds => { clock += milliseconds; intervals.forEach(fn => fn()); },
    blur: () => focusSlots.forEach(i => { slots[i].cleanup?.(); slots[i].cleanup=undefined; slots[i].deps=[]; }),
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
  assert.match(text(tree), /No rewards available right now/);
  assert.ok(button(tree, 'My Rewards'));
  screen.close(); inventory = [reward]; screen = make(); tree = await screen.settle();
  const redeem = rewardCard(tree, reward.name); redeem.props.onPress(); redeem.props.onPress();
  const modal = () => rewardModal(screen);
  assert.equal(screen.alerts.length, 0);
  assert.equal(modal().reward.name, reward.name); assert.equal(modal().reward.voucher_value, '100.00');
  assert.equal(modal().reward.points_cost,300); assert.equal(modal().reason,'');
  modal().onClose(); assert.equal(calls.length, 0); assert.equal(modal().reward, null);
  rewardCard(screen.render(), reward.name).props.onPress();
  fail = true;
  const confirm = modal().onRedeem; confirm(); confirm();
  await screen.settle(); assert.equal(calls.length, 1); assert.equal(balances.at(-1), 650); assert.ok(pending);
  screen.close();
  // Reopening retains the exact request key; a retry can finish after stock is exhausted.
  inventory = [{ ...reward, stock_quantity: 0 }]; screen = make(); tree = await screen.settle();
  assert.equal(rewardCard(tree, reward.name).props.disabled,false);
  rewardCard(tree, reward.name).props.onPress();assert.match(modal().reason,/pending redemption/);
  modal().onRedeem();assert.equal(calls.length,1);modal().onClose();
  fail = false; button(tree, 'Retry pending redemption').props.onPress(); await screen.settle();
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.equal(pending, null); assert.equal(balances.at(-1), 350); assert.equal(screen.routes[0], '/my-vouchers');
  screen.close();
  inventory = [{ ...reward, points_cost: 900 }]; screen = make(); tree = await screen.settle();
  rewardCard(tree,reward.name).props.onPress();assert.match(modal().reason,/insufficient/);
  modal().onRedeem();assert.equal(calls.length,2);
  screen.close();
  inventory = [{ ...reward, stock_quantity: 0 }]; screen = make(); tree = await screen.settle();
  assert.match(text(tree), /100.00/);rewardCard(tree,reward.name).props.onPress();assert.match(modal().reason,/out of stock/);
  assert.equal(button(tree, 'Refresh rewards'), undefined);
  inventory = [reward]; const currentRewards = auth.rewards; auth.rewards = () => currentRewards(); tree = await screen.settle();
  assert.equal(modal().reason,'','Replenished active stock is redeemable after refresh');modal().onClose();
  const original = auth.rewards;
  auth.rewards = async () => { throw new ApiError('Offline'); };
  tree = await screen.settle(); assert.match(text(tree), /Test reward/); assert.match(text(tree), /Connection Problem/); assert.ok(button(tree, 'Retry'));
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
  assert.ok(!nodes(tree).some(node=>node.props?.accessibilityLabel?.startsWith('Size ')),'Sizes are not on catalogue cards');
  rewardCard(tree,apparel.name).props.onPress();
  const modal = () => rewardModal(screen);
  assert.match(modal().reason,/Choose an available size/);
  modal().onSelectVariant(34);assert.equal(modal().variantId,undefined,'Sold-out sizes cannot be selected');
  modal().onSelectVariant(35);assert.equal(modal().variantId,undefined,'Disabled sizes cannot be selected');
  modal().onSelectVariant(999);assert.equal(modal().variantId,undefined,'Foreign variant IDs cannot be selected');
  modal().onSelectVariant(31);
  tree = screen.render();
  assert.equal(modal().reason,'');assert.equal(modal().variantId,31);
  const confirm = modal().onRedeem; confirm(); confirm(); await screen.settle();
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
  let tree = await catalogue.settle(); assert.ok(nodes(tree).some(n=>n.type==='TabSkeleton'&&n.props.variant==='rewards')); assert.match(text(tree),/Available Rewards/);assert.doesNotMatch(text(tree), /Loading|Refreshing|--/);
  assert.equal(nodes(tree).filter(n => n.type === 'Spinner').length, 0, 'Initial reward skeletons must not share their fetch with a header spinner');
  const reward = { id: 1, name: 'Image reward', image_url: 'http://localhost/storage/rewards/test.png', voucher_value: '250.00', points_cost: 100, stock_quantity: 8 };
  finish({ data: [reward], request_key: 'image-request' }); tree = await catalogue.settle();
  const image = nodes(tree).find(n => n.type === 'RewardImage'); assert.equal(image.props.reward.image_url, reward.image_url);
  assert.match(text(tree), /Redeem for 100 Blood Points/); assert.match(text(tree), /8 remaining/); assert.equal(button(tree, 'Refresh rewards'), undefined);
  auth.rewards = () => new Promise(resolve => { finish = resolve; }); tree = await catalogue.settle();
  assert.match(text(tree), /Image reward/); assert.ok(!nodes(tree).some(n => n.type === 'TabSkeleton')); assert.doesNotMatch(text(tree), /Refreshing/);
  finish({ data: [], request_key: 'empty-request' }); tree = await catalogue.settle(); assert.match(text(tree), /No rewards available/); catalogue.close();

  const calls = []; let finishHistory;
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, amount: 100, description: 'Donation ' + i, created_at: '2026-09-28T00:00:00Z' }));
  const pointsAuth = { pointsSummary: async () => ({ current_balance: 800 }), pointTransactions: async (page, type) => { calls.push({ page, type }); return { data: rows, current_page: page, last_page: 2 }; } };
  const points = harness('src/app/(tabs)/points.tsx', pointsAuth);
  assert.equal(nodes(points.render()).filter(n => n.type === 'TabSkeleton').length, 2,'Balance and history load independently with their own matching placeholders');
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
  pointsAuth.pointTransactions = async () => ({ data: [], current_page: 1, last_page: 1 }); tree = await points.settle(); assert.match(text(tree), /No matching transactions/); points.close();
}

// ========================================
// VOUCHER FILTERS AND HISTORY NAVIGATION
// Raw redeemed includes legacy history; only confirmed claims appear in Claimed.
// ========================================
async function loadingExclusionChecks() {
  const skeletons = tree => nodes(tree).filter(n => n.type === 'TabSkeleton');
  const spinners = tree => nodes(tree).filter(n => n.type === 'Spinner');
  const circle = tree => nodes(tree).find(n => n.props?.accessibilityLabel === '800 Blood Points');
  // Balance and ledger can resolve in either order. A focus refresh can overlap a new history filter.
  for (const balanceFirst of [true, false]) {
    let balance = deferred(), history = deferred(), reads = 0;
    const auth = { pointsSummary: () => balance.promise, pointTransactions: () => { reads++; return history.promise; } };
    const points = harness('src/app/(tabs)/points.tsx', auth);
    let tree = await points.settle();assert.equal(skeletons(tree).length, 2);assert.equal(spinners(tree).length, 0);
    if (balanceFirst) balance.resolve({ current_balance: 800 });
    else history.resolve({ data: [], current_page: 1, last_page: 1 });
    tree = await points.settle();assert.equal(skeletons(tree).length, 1);assert.equal(spinners(tree).length, 0);
    assert.equal(!!circle(tree), balanceFirst, 'Only a confirmed balance displays the normal points circle');
    if (balanceFirst) history.resolve({ data: [], current_page: 1, last_page: 1 });
    else balance.resolve({ current_balance: 800 });
    tree = await points.settle();assert.equal(skeletons(tree).length, 0);assert.ok(circle(tree));assert.match(text(tree), /No transactions yet/);
    points.blur();balance = deferred();history = deferred();tree = await points.settle();
    assert.ok(circle(tree));assert.equal(skeletons(tree).length, 0);assert.equal(spinners(tree).length, 0, 'Points refresh retains loaded content without circular loaders');
    button(tree, 'Earned').props.onPress();tree = await points.settle();
    assert.equal(skeletons(tree).length, 1);assert.equal(spinners(tree).length, 0, 'A cached balance refresh must not add a circular indicator beside history skeletons');
    balance.resolve({ current_balance: 800 });history.reject(new ApiError('Offline'));tree = await points.settle();
    assert.ok(circle(tree));assert.equal(skeletons(tree).length, 0);assert.match(text(tree), /Connection Problem/);assert.doesNotMatch(text(tree), /No matching transactions/);
    history = deferred();const before = reads, retry = button(tree, 'Retry').props.onPress;
    const request = retry();retry();assert.equal(reads, before + 1);
    tree = await points.settle();assert.equal(skeletons(tree).length, 1);assert.equal(spinners(tree).length, 0);
    history.resolve({ data: [], current_page: 1, last_page: 1 });await request;tree = await points.settle();assert.match(text(tree), /No matching transactions/);points.close();
  }
  const failed = harness('src/app/(tabs)/points.tsx', { pointsSummary: async () => { throw new ApiError('Offline'); }, pointTransactions: async () => { throw new ApiError('Offline'); } });
  const failedTree = await failed.settle();assert.equal(skeletons(failedTree).length, 0);assert.equal(spinners(failedTree).length, 0);
  assert.ok(button(failedTree, 'Retry balance'));assert.ok(button(failedTree, 'Retry'));assert.doesNotMatch(text(failedTree), /--|No transactions yet/);failed.close();
  // A failed next page must keep its rows, loading label and exact-page Retry without a spinner.
  let nextPage = deferred();const pageReads = [];
  const firstRow = { id: 1, amount: 300, description: 'Verified donation', created_at: '2026-10-25T00:00:00Z' };
  const paginated = harness('src/app/(tabs)/points.tsx', {
    pointsSummary: async () => ({ current_balance: 800 }),
    pointTransactions: number => { pageReads.push(number);return number === 1 ? Promise.resolve({ data: [firstRow], current_page: 1, last_page: 2 }) : nextPage.promise; },
  });
  let pageTree = await paginated.settle();const loadMore = button(pageTree, 'Load more transactions').props.onPress;
  loadMore();loadMore();pageTree = await paginated.settle();assert.deepEqual(pageReads, [1, 2]);
  assert.ok(button(pageTree, 'Loading more...').props.disabled);assert.equal(spinners(pageTree).length, 0);assert.equal(skeletons(pageTree).length, 0);assert.match(text(pageTree), /Verified donation/);
  nextPage.reject(new ApiError('Offline'));pageTree = await paginated.settle();assert.match(text(pageTree), /Verified donation/);assert.match(text(pageTree), /Connection Problem/);
  nextPage = deferred();const retryPage = button(pageTree, 'Retry').props.onPress, retrying = retryPage();retryPage();
  pageTree = await paginated.settle();assert.deepEqual(pageReads, [1, 2, 2]);assert.equal(spinners(pageTree).length, 0);assert.ok(button(pageTree, 'Loading more...').props.disabled);
  nextPage.resolve({ data: [{ ...firstRow, id: 2, description: 'Another donation' }], current_page: 2, last_page: 2 });await retrying;
  pageTree = await paginated.settle();assert.match(text(pageTree), /Verified donation/);assert.match(text(pageTree), /Another donation/);assert.equal(button(pageTree, 'Load more transactions'), undefined);paginated.close();
  // Catalogue and balance are committed together; either dependency can be the slow one.
  for (const catalogueFirst of [true, false]) {
    let balance = deferred(), rewards = deferred(), reads = 0;
    const auth = { user: { id: 1 }, rewards: () => { reads++; return rewards.promise; }, pointsSummary: () => balance.promise };
    const catalogue = harness('src/components/reward-catalogue.tsx', auth, { '@/services/redemption-storage': { redemptionStorage: { read: async () => null } } }, { showBalance: true }, 'RewardCatalogue');
    let tree = await catalogue.settle();assert.equal(skeletons(tree).length, 2);assert.equal(spinners(tree).length, 0);
    if (catalogueFirst) rewards.resolve({ data: [], request_key: 'unused' });else balance.resolve({ current_balance: 800 });
    tree = await catalogue.settle();assert.equal(skeletons(tree).length, 2);assert.equal(spinners(tree).length, 0);assert.doesNotMatch(text(tree), /No rewards available/);
    if (catalogueFirst) balance.reject(new ApiError('Offline'));else rewards.reject(new ApiError('Offline'));
    tree = await catalogue.settle();assert.equal(skeletons(tree).length, 0);assert.equal(spinners(tree).length, 0);assert.match(text(tree), /Connection Problem/);assert.doesNotMatch(text(tree), /--|No rewards available/);
    rewards = deferred();balance = deferred();const retry = button(tree, 'Retry').props.onPress, before = reads;
    const request = retry();retry();assert.equal(reads, before + 1);tree = await catalogue.settle();assert.equal(spinners(tree).length, 0);
    rewards.resolve({ data: [], request_key: 'fresh' });balance.resolve({ current_balance: 800 });await request;
    tree = await catalogue.settle();assert.equal(skeletons(tree).length, 0);assert.match(text(tree), /800/);assert.match(text(tree), /No rewards available/);
    catalogue.blur();rewards = deferred();balance = deferred();tree = await catalogue.settle();
    assert.equal(skeletons(tree).length, 0);assert.equal(spinners(tree).length, 1);assert.match(text(tree), /800/);
    rewards.reject(new ApiError('Offline'));balance.resolve({ current_balance: 800 });tree = await catalogue.settle();
    assert.equal(spinners(tree).length, 0);assert.match(text(tree), /800/);assert.match(text(tree), /Connection Problem/);catalogue.close();
  }
  console.log('Loading hotfix checks passed: staggered balance/history/catalogue requests, skeleton/spinner exclusion, loaded balance circles, guarded Retry, filter/focus refresh retention and initial failures.');
}

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
  offline = true; list().onRefresh(); await screen.settle(); assert.equal(list().data.length, 1,'Refresh failures preserve owned reward history'); assert.match(text(list().ListHeaderComponent), /Connection Problem/);
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

async function phaseDChecks() {
  const voucher={id:71,name:'LifeFlow voucher with a long name',category:'vouchers',points_cost:100,stock_quantity:3,voucher_value:'250.00',image_url:'http://localhost/storage/rewards/voucher.png',description:'Reward description. '.repeat(80)};
  const apparel={...voucher,id:72,name:'LifeFlow shirt',category:'apparel',voucher_value:null,variants:[
    {id:721,size:'S',enabled:true,stock_quantity:2},{id:722,size:'XL',enabled:true,stock_quantity:0},{id:723,size:'2XL',enabled:false,stock_quantity:4}]};
  const savedByUser=new Map(),events=[],calls=[];let inventory=[voucher,apparel],balance=500,key='phase-d-key',saveWait,replyWait;
  const auth={user:{id:1},rewards:async()=>({data:inventory,request_key:key}),pointsSummary:async()=>({current_balance:balance}),
    redeemReward:async(...args)=>{events.push('request');calls.push(args);return replyWait?.promise??{summary:{current_balance:400},reward:{...voucher,stock_quantity:2}};}};
  const storage={read:async id=>savedByUser.get(id)??null,save:async(id,attempt)=>{events.push('save');if(saveWait)await saveWait.promise;savedByUser.set(id,attempt);},clear:async id=>{events.push('clear');savedByUser.delete(id);}};
  const make=()=>harness('src/components/reward-catalogue.tsx',auth,{'@/services/redemption-storage':{redemptionStorage:storage}},{showBalance:true},'RewardCatalogue');
  let screen=make(),tree=await screen.settle();
  for(const reward of inventory){
    const card=rewardCard(tree,reward.name);assert.equal(card.props.accessibilityRole,'button');assert.equal(nodes(card).filter(n=>n.type==='Pressable').length,1);
    assert.ok(nodes(card).some(n=>n.type==='Icon'&&n.props.name==='chevron-right'&&n.props.accessible===false));
    assert.ok(card.props.style({pressed:true}).some(style=>style?.opacity<1));assert.equal(button(card,'Redeem'),undefined);
    const title=nodes(card).find(n=>n.type==='Text'&&n.props.children===reward.name);assert.equal(title.props.style.minWidth,0);assert.equal(title.props.numberOfLines,undefined);
  }
  rewardCard(tree,apparel.name).props.onPress();assert.match(rewardModal(screen).reason,/Choose an available size/);
  rewardModal(screen).onSelectVariant(721);assert.equal(rewardModal(screen).variantId,721);
  const staleConfirmation=rewardModal(screen).onRedeem;rewardModal(screen).onClose();staleConfirmation();assert.equal(calls.length,0,'A closed confirmation cannot spend');
  rewardCard(screen.render(),voucher.name).props.onPress();assert.equal(rewardModal(screen).reward.id,71);assert.equal(rewardModal(screen).variantId,undefined);
  staleConfirmation();assert.equal(calls.length,0,'A prior reward callback cannot confirm the newly opened reward');
  rewardModal(screen).onClose();rewardCard(screen.render(),apparel.name).props.onPress();assert.equal(rewardModal(screen).variantId,undefined,'Size resets when reopening apparel');
  rewardModal(screen).onSelectVariant(721);
  inventory=[voucher,{...apparel,variants:apparel.variants.map(v=>({...v,stock_quantity:0}))}];screen.blur();await screen.settle();
  assert.equal(rewardModal(screen).variantId,undefined);assert.match(rewardModal(screen).reason,/No sizes are currently available/);rewardModal(screen).onRedeem();assert.equal(calls.length,0);
  inventory=[voucher];screen.blur();await screen.settle();assert.match(rewardModal(screen).reason,/no longer available/);assert.equal(rewardModal(screen).reward.id,72);rewardModal(screen).onClose();
  // Persist before HTTP; even old Cancel/X handlers cannot dismiss an in-flight request.
  rewardCard(screen.render(),voucher.name).props.onPress();const beforeSubmit=rewardModal(screen);saveWait=deferred();replyWait=deferred();
  beforeSubmit.onRedeem();beforeSubmit.onRedeem();await flush();assert.deepEqual(events,['save']);assert.equal(calls.length,0);
  beforeSubmit.onClose();assert.equal(rewardModal(screen).reward.id,71);assert.equal(rewardModal(screen).busy,true);
  saveWait.resolve();await flush();assert.equal(calls.length,1);assert.deepEqual(calls[0],[71,key,undefined]);assert.ok(savedByUser.get(1));
  assert.equal(screen.routes.length,0,'No premature success navigation');assert.equal(rewardModal(screen).balance,500,'No optimistic point deduction');
  replyWait.resolve({summary:{current_balance:400},reward:{...voucher,stock_quantity:2}});await screen.settle();
  assert.deepEqual(screen.routes,['/my-vouchers']);assert.equal(rewardModal(screen).reward,null);assert.match(text(screen.render()),/400/);assert.equal(savedByUser.size,0);
  assert.deepEqual(events,['save','request','clear']);screen.close();saveWait=undefined;replyWait=undefined;
  // Missing/malformed data, insufficient balance and zero stock remain inspectable but cannot spend.
  const beforeBlocked=calls.length;
  for(const scenario of ['balance','cost','stock','key','insufficient','sold-out']){
    inventory=[{...voucher,...(scenario==='cost'?{points_cost:undefined}:scenario==='stock'?{stock_quantity:undefined}:scenario==='sold-out'?{stock_quantity:0}:{})}];
    balance=scenario==='balance'?undefined:scenario==='insufficient'?10:500;key=scenario==='key'?'':'phase-d-key';
    screen=make();await screen.settle();rewardCard(screen.render(),voucher.name).props.onPress();assert.ok(rewardModal(screen).reward);assert.ok(rewardModal(screen).reason);
    rewardModal(screen).onRedeem();await screen.settle();assert.equal(calls.length,beforeBlocked);screen.close();
  }
  balance=500;key='phase-d-key';inventory=[voucher];
  // Definitive failures clear pending; uncertain failures keep the original key across restart/retry.
  for(const status of [404,422,0,500,401]){
    savedByUser.clear();let fail=true;const failures=[];
    const failedAuth={...auth,redeemReward:async(...args)=>{failures.push(args);if(fail)throw new ApiError(status?'Server rejected reward':'Request timed out',status);return {summary:{current_balance:400},reward:voucher};}};
    const failedMake=()=>harness('src/components/reward-catalogue.tsx',failedAuth,{'@/services/redemption-storage':{redemptionStorage:storage}},{},'RewardCatalogue');
    screen=failedMake();await screen.settle();rewardCard(screen.render(),voucher.name).props.onPress();rewardModal(screen).onRedeem();await screen.settle();
    assert.equal(screen.routes.length,0);assert.match(text(screen.render()),/Server rejected reward|Request timed out/);
    assert.equal(savedByUser.has(1),![404,422].includes(status));
    if(![404,422].includes(status)){
      screen.close();screen=failedMake();await screen.settle();rewardCard(screen.render(),voucher.name).props.onPress();assert.match(rewardModal(screen).reason,/pending redemption/);
      rewardModal(screen).onRedeem();assert.equal(failures.length,1);rewardModal(screen).onClose();fail=false;
      button(screen.render(),'Retry pending redemption').props.onPress();await screen.settle();assert.equal(failures.length,2);assert.deepEqual(failures[0],failures[1]);assert.equal(savedByUser.has(1),false);
      assert.deepEqual(screen.routes,['/my-vouchers']);
    }
    screen.close();
  }
  // A focus refresh during persistence must keep the saved attempt reachable even if HTTP is skipped.
  savedByUser.clear();calls.length=0;auth.user={id:1};saveWait=deferred();screen=make();await screen.settle();
  rewardCard(screen.render(),voucher.name).props.onPress();rewardModal(screen).onRedeem();await flush();screen.blur();await screen.settle();
  saveWait.resolve();await screen.settle();assert.equal(calls.length,0);assert.ok(button(screen.render(),'Retry pending redemption'));screen.close();saveWait=undefined;
  // Switching accounts during persistence must not send the old attempt using the new account.
  savedByUser.clear();calls.length=0;auth.user={id:1};saveWait=deferred();screen=make();await screen.settle();
  rewardCard(screen.render(),voucher.name).props.onPress();rewardModal(screen).onRedeem();await flush();
  auth.user={id:2};inventory=[{...voucher,name:'Second account reward'}];tree=screen.render();assert.doesNotMatch(text(tree),/LifeFlow voucher with a long name/);
  await screen.settle();saveWait.resolve();await screen.settle();assert.equal(calls.length,0);assert.ok(savedByUser.has(1));assert.equal(savedByUser.has(2),false);assert.equal(screen.routes.length,0);screen.close();saveWait=undefined;
  // Late server success likewise cannot update the next account or navigate it away.
  savedByUser.clear();auth.user={id:1};inventory=[voucher];replyWait=deferred();screen=make();await screen.settle();rewardCard(screen.render(),voucher.name).props.onPress();rewardModal(screen).onRedeem();await flush();
  auth.user={id:2};balance=900;await screen.settle();replyWait.resolve({summary:{current_balance:400},reward:voucher});await screen.settle();assert.match(text(screen.render()),/900/);assert.equal(screen.routes.length,0);screen.close();replyWait=undefined;
  // Real modal rendering: centered/scrollable, dynamic sizes, accessible dismissal and busy guards.
  const base={reward:voucher,balance:500,busy:false,reason:'',selectionDisabled:false,onSelectVariant:()=>{},onClose:()=>{},onRedeem:()=>{}};
  for(const dimensions of [{width:320,height:640,fontScale:1},{width:375,height:720,fontScale:2},{width:720,height:320,fontScale:1}]){
    let closes=0,confirms=0,selections=[];const props={...base,onClose:()=>closes++,onRedeem:()=>confirms++,onSelectVariant:id=>selections.push(id)};
    const native={View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',Modal:'Modal',ScrollView:'ScrollView',StyleSheet:{create:v=>v},useWindowDimensions:()=>dimensions};
    const modal=harness('src/components/reward-details-modal.tsx',{}, {'react-native':native},props,'RewardDetailsModal');
    let ui=modal.render();assert.equal(ui.type,'Modal');assert.equal(ui.props.transparent,true);assert.equal(ui.props.visible,true);
    const overlay=ui.props.children,dialog=overlay.props.children;assert.equal(overlay.props.style.justifyContent,'center');assert.equal(dialog.props.style.maxHeight,'100%');assert.equal(dialog.props.accessibilityViewIsModal,true);
    assert.ok(nodes(ui).some(n=>n.type==='ScrollView'));assert.match(text(ui),/Reward Details/);assert.match(text(ui),/250.00/);assert.match(text(ui),/100 Blood Points/);assert.doesNotMatch(text(ui),/Choose your size/);
    assert.equal(nodes(ui).filter(n=>n.type==='ConfirmationModal').length,0,'No second confirmation dialog');
    assert.ok(nodes(ui).some(n=>n.type?.name==='RewardImage'&&n.props.large));
    ui.props.onRequestClose();button(ui,'Cancel').props.onPress();nodes(ui).find(n=>n.props?.accessibilityLabel==='Close reward details').props.onPress();assert.equal(closes,3);
    button(ui,'Redeem').props.onPress();assert.equal(confirms,1);
    props.reward=apparel;props.reason='Choose an available size';ui=modal.render();assert.equal(button(ui,'Redeem').props.disabled,true);button(ui,'Redeem').props.onPress();assert.equal(confirms,1);
    const sizeChips=nodes(ui).filter(n=>n.props?.accessibilityRole==='radio');assert.equal(sizeChips.length,2);assert.equal(sizeChips[1].props.disabled,true);sizeChips[1].props.onPress();assert.deepEqual(selections,[]);
    sizeChips[0].props.onPress();assert.deepEqual(selections,[721]);assert.equal(sizeChips[0].props.style[0].minHeight,44);
    props.variantId=721;props.reason='';ui=modal.render();assert.equal(nodes(ui).find(n=>n.props?.accessibilityRole==='radio').props.accessibilityState.selected,true);
    assert.doesNotMatch(text(ui),/Voucher Value/);
    props.busy=true;props.selectionDisabled=true;ui=modal.render();ui.props.onRequestClose();button(ui,'Cancel').props.onPress();nodes(ui).find(n=>n.props?.accessibilityLabel==='Close reward details').props.onPress();assert.equal(closes,3);
    assert.equal(button(ui,'Redeeming...').props.disabled,true);assert.match(text(ui),/Redeeming/);assert.ok(nodes(ui).filter(n=>n.props?.accessibilityRole==='radio').every(n=>n.props.disabled));
    for(const label of ['Cancel','Redeeming...'])assert.ok(button(ui,label).props.style[0].minHeight>=48);
    props.reward=null;assert.equal(modal.render().props.visible,false);modal.close();
  }
  const imageProps={reward:voucher,large:true};const image=harness('src/components/reward-details-modal.tsx',{}, {},imageProps,'RewardImage');
  let imageTree=image.render(),imageNode=nodes(imageTree).find(n=>n.type==='Image');assert.equal(imageNode.props.source.uri,'http://device.test:8000/storage/rewards/voucher.png');assert.equal(imageNode.props.resizeMode,'contain');
  imageNode.props.onError();assert.ok(nodes(image.render()).some(n=>n.type==='Icon'&&n.props.name==='card-giftcard'));
  imageProps.reward={...voucher,image_url:'https://cdn.test/replacement.png'};assert.ok(nodes(image.render()).some(n=>n.type==='Image'));
  imageProps.reward={...voucher,image_url:null};assert.ok(nodes(image.render()).some(n=>n.type==='Icon'));image.close();
  console.log('Phase D checks passed: whole cards/chevrons, one centered scrollable popup, image fallback, Cancel/X/back and busy guards, live apparel selection/reset, balance/stock/key validation, persist-before-request, idempotent retries, account races, server-confirmed My Rewards navigation, and narrow/landscape/font accessibility configuration (mocked native boundaries).');
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
  tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assertChoices(); assert.match(text(tree), /No matching rewards/);
  auth.rewards = async () => { catalogueCalls++; throw new ApiError('Catalogue unavailable'); };
  tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assertChoices(); assert.match(text(tree), /Catalogue unavailable/);
  auth.rewards = async () => { catalogueCalls++; return { data: rows, request_key: 'retry-category' }; };
  button(tree, 'Retry').props.onPress(); tree = await host.settle(); assert.deepEqual(selected(), ['Apparel']); assert.match(text(tree), /Apparel shirt/);
  select('Merchandise'); tree = host.render(); rewardCard(tree,rows[0].name).props.onPress();
  const confirmation = rewardModal(host); confirmation.onRedeem(); confirmation.onRedeem(); await flush();
  assert.ok(choices().every(n => n.props.disabled && n.props.accessibilityState.disabled), 'Filter stays disabled during purchase');
  finishPurchase({ summary: { current_balance: 400 }, reward: { ...rows[0], stock_quantity: 1 } }); tree = await host.settle();
  assert.equal(host.routes.pop(), '/my-vouchers'); assert.match(text(tree), /400/); assert.deepEqual(selected(), ['Merchandise']); assertChoices();
  host.close();
  console.log('Redeem filter checks passed: exact four choices/Activity horizontal chip styles, selected/accessibility states, legacy rewards under All, local switching without requests, narrow-width/font configuration, preserved selection on refresh/error/retry, and purchase/My Rewards flow (mocked native boundaries).');
}

(async () => {
  await serviceChecks(); await catalogueChecks(); await apparelChecks(); await pointsNavigationChecks(); await polishChecks(); await historyChecks(); await voucherChecks();
  await categoryFilterChecks();
  await phaseDChecks();
  await loadingExclusionChecks();
  assert.equal(fs.existsSync('src/services/mock-voucher-store.ts'), false);
  console.log('Points/rewards/voucher client checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

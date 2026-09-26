/* ========================================
 * SMALL ACCOUNT INTEGRATION CHECKS
 * Uses the installed TypeScript compiler and Node assertions, with no new
 * test framework. Mock storage stands in for device-only SecureStore.
 * Run: node scripts/check-account-integration.cjs
 * Add --live to create a disposable test account on the configured API.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomBytes } = require('node:crypto');

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`); },
    process, AbortController, setTimeout, clearTimeout, fetch: (...args) => global.fetch(...args), ...globals,
  }, { filename: file });
  return module.exports;
}
const api = load('src/services/api.ts');
const service = load('src/services/auth.ts', { './api': api });
const fixture = {
  acceptedTerms: true, acknowledgedPrivacy: true, acknowledgedPrescreening: true,
  firstName: 'Integration', middleName: '', lastName: 'Check', email: 'check@example.test',
  mobileNumber: '09123456789', birthDate: '02/29/2000', gender: 'Female', bloodType: 'O+',
  password: randomBytes(24).toString('hex'), confirmPassword: '',
};
fixture.confirmPassword = fixture.password;

/* ========================================
 * REQUEST CONTRACT AND ERROR CHECKS
 * Verifies exact payloads, dates, headers, safe failures, and field mapping.
 * ======================================== */
async function requestChecks() {
  const realFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ user: { id: 1 }, token: 'test-only' }) }; };
  try {
    await service.authApi.register(fixture);
    assert.deepEqual(JSON.parse(request.body), {
      accepted_terms: true, acknowledged_privacy: true, acknowledged_prescreening: true,
      first_name: 'Integration', middle_name: null, last_name: 'Check', email: fixture.email,
      mobile_number: fixture.mobileNumber, birth_date: '2000-02-29', gender: 'Female', blood_type: 'O+',
      password: fixture.password, password_confirmation: fixture.password,
    });
    assert.equal(request.headers.Accept, 'application/json');
    assert.equal(request.headers['Content-Type'], 'application/json');
    assert.equal(request.headers.Authorization, undefined);
    for (const date of ['02/29/1900', '04/31/2000', '13/01/2000', '01/00/2000', '01/01/0000', '2000-01-01']) {
      assert.throws(() => service.toApiDate(date), { status: 422 });
    }
    await service.authApi.updateProfile('test-only', { ...fixture, user_id: 99 });
    assert.equal(request.method, 'PUT');
    assert.equal(request.headers.Authorization, 'Bearer test-only');
    assert.equal(JSON.parse(request.body).user_id, undefined);
    assert.equal(JSON.parse(request.body).password, undefined);
    global.fetch = async () => ({ ok: false, status: 422, json: async () => ({ errors: { email: ['Email already used.'], birth_date: ['Invalid date.'] } }) });
    await assert.rejects(service.authApi.register(fixture), error => {
      assert.equal(service.formErrors(error).email, 'Email already used.');
      assert.equal(service.formErrors(error).birthDate, 'Invalid date.');
      return true;
    });
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'SECRET STACK TRACE' }) });
    await assert.rejects(service.authApi.login(fixture.email, fixture.password), error => !error.message.includes('SECRET'));
    global.fetch = async () => ({ ok: true, json: async () => { throw new Error('HTML'); } });
    await assert.rejects(service.authApi.currentUser('test-only'), /unreadable/);
    global.fetch = async () => { throw new Error('Network'); };
    await assert.rejects(service.authApi.currentUser('test-only'), /Cannot reach/);
    const timedApi = load('src/services/api.ts', {}, { setTimeout: fn => setTimeout(fn, 1) });
    global.fetch = (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
    await assert.rejects(timedApi.apiRequest('/user'), /timed out/);
  } finally { global.fetch = realFetch; }
  console.log('PASS: request mapping, headers, date validation, safe errors, profile field allowlist');
}

/* ========================================
 * PROVIDER LIFECYCLE CHECKS
 * Minimal hook harness runs provider operations with controlled storage/API.
 * Device rendering and real SecureStore persistence remain Expo Go checks.
 * ======================================== */
function providerHarness(initialToken = null) {
  const slots = []; let cursor = 0; let first = true; const effects = [];
  let saved = initialToken; let removeFails = false;
  const user = { id: 7, name: 'Integration Check', email: fixture.email };
  const profile = { ...service.toProfilePayload(fixture) };
  const calls = [];
  const backend = {
    login: async () => ({ user, token: 'test-only' }),
    register: async () => ({ pending_token: 'pending-test', resend_after: 60, expires_in: 900 }),
    verifyRegistration: async () => ({ user, token: 'test-only', donor_profile: profile }),
    currentUser: async token => { calls.push(['user', token]); return user; },
    profile: async token => { calls.push(['profile', token]); return { user, donor_profile: profile }; },
    updateProfile: async (token, form) => ({ user: { ...user, name: form.firstName }, donor_profile: { ...profile, first_name: form.firstName } }),
    logout: async token => { calls.push(['logout', token]); },
  };
  const storage = {
    get: async () => saved,
    save: async value => { saved = value; },
    remove: async () => { if (removeFails) throw new Error('Storage failure'); saved = null; },
  };
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback: fn => fn,
    useEffect: fn => { if (first) effects.push(fn); },
  };
  const module = load('src/contexts/auth-context.tsx', {
    // ========================================
    // CURRENT PROVIDER DEPENDENCIES
    // Account tests do not call these endpoints, but the shared provider
    // imports donation and eligibility services during initialization.
    // ========================================
    // Rewards now share the protected account request wrapper.
    '@/services/flowie-chat': { requestFlowieChat: async()=>({reply:'Guide'}) },
    '@/services/rewards': { rewardsApi: {} },
    '@/services/notifications': { notificationApi: {} },
    '@/services/donations': { donationApi: {join:(...args)=>backend.join(...args)} },
    '@/services/eligibility': { eligibilityApi: {} },
    react, 'react/jsx-runtime': { jsx: (_, props) => props },
    '@/services/api': api, '@/services/auth': { authApi: backend }, '@/services/token-storage': { tokenStorage: storage },
  });
  const render = () => { cursor = 0; const result = module.AuthProvider({ children: null }).value; first = false; return result; };
  return { render, backend, calls, saved: () => saved, failRemove: value => { removeFails = value; }, effects };
}

async function providerChecks() {
  let h = providerHarness(); let state = h.render();
  await state.restore(); await state.register(fixture); assert.equal(h.render().user, null); await h.render().verifyRegistration('pending-test', '123456');
  assert.equal(h.saved(), 'test-only'); assert.equal(h.render().profile.first_name, 'Integration');
  assert.equal(h.calls.length, 0);
  await h.render().saveProfile({ ...fixture, firstName: 'Updated' });
  assert.equal(h.render().user.name, 'Updated'); assert.equal(h.render().profile.first_name, 'Updated');
  await h.render().logout(); assert.equal(h.saved(), null); assert.equal(h.render().user, null); assert.equal(h.render().profile, null);
  await assert.rejects(h.render().loadProfile(), { status: 401 });
  h = providerHarness('stored-test'); state = h.render(); await state.restore();
  assert.equal(h.render().user.id, 7); assert.deepEqual(h.calls, [['user', 'stored-test']]);
  h = providerHarness('revoked-test'); state = h.render(); h.backend.currentUser = async () => { throw new api.ApiError('Expired', 401); };
  await state.restore(); assert.equal(h.saved(), null); assert.equal(h.render().user, null);
  h = providerHarness('offline-test'); state = h.render(); h.backend.currentUser = async () => { throw new api.ApiError('Offline'); };
  await state.restore(); assert.equal(h.saved(), 'offline-test'); assert.equal(h.render().user, null); assert.equal(h.render().sessionError, 'Offline');
  h = providerHarness(); state = h.render(); await state.login(fixture.email, fixture.password);
  h.backend.logout = async () => { throw new api.ApiError('Offline'); };
  assert.match(await h.render().logout(), /could not be confirmed/); assert.equal(h.saved(), null);
  await h.render().login(fixture.email, fixture.password); h.failRemove(true); await h.render().logout();
  assert.equal(h.render().user, null); assert.ok(h.render().sessionError);
  h.failRemove(false); await h.render().restore(); assert.equal(h.saved(), null); assert.equal(h.render().user, null);
  let finish; h.backend.login = () => new Promise(resolve => { finish = resolve; });
  const pending = h.render().login('', ''); await assert.rejects(h.render().login('', ''), /Please wait/);
  finish({ user: { id: 7 }, token: 'test-only' }); await pending;
  h.backend.profile = async () => { throw new api.ApiError('Expired', 401); };
  await assert.rejects(h.render().loadProfile(), { status: 401 });
  assert.equal(h.saved(), null); assert.equal(h.render().user, null);
  await h.render().register(fixture); await h.render().verifyRegistration('pending-test', '123456');
  let finishProfile;
  h.backend.profile = () => new Promise(resolve => { finishProfile = resolve; });
  const profileRequest = h.render().loadProfile();
  await h.render().logout();
  finishProfile({ user: { id: 7 }, donor_profile: { first_name: 'Stale' } });
  await profileRequest;
  assert.equal(h.render().user, null); assert.equal(h.render().profile, null);
  h = providerHarness(); await h.render().login(fixture.email, fixture.password);
  let resolveOldProfile; h.backend.profile = () => new Promise(resolve => { resolveOldProfile = resolve; });
  const oldProfile = h.render().loadProfile();
  h.backend.verifyEmailChange = async (token, pending, code) => { assert.equal(token, 'test-only'); return {user:{id:7,name:'Integration',email:'updated@example.test'}}; };
  await h.render().verifyEmailChange('opaque','123456');
  resolveOldProfile({user:{id:7,email:'stale@example.test'},donor_profile:{first_name:'Old'}}); await oldProfile;
  assert.equal(h.render().user.email,'updated@example.test');
  h.backend.changePassword = async token => { assert.equal(token,'test-only'); return {message:'Password updated successfully.'}; };
  await h.render().changePassword('current','new-password','new-password');assert.equal(h.saved(),'test-only');
  h.backend.saveAvatar = async (token, avatar) => { assert.equal(token,'test-only'); assert.equal(avatar,'mascot_4'); return {user:h.render().user,donor_profile:{first_name:'Integration',profile_avatar:avatar}}; };
  await h.render().saveAvatar('mascot_4'); assert.equal(h.render().profile.profile_avatar,'mascot_4');
  h = providerHarness(); await h.render().login(fixture.email, fixture.password);
  let rejectJoin;
  h.backend.join = () => new Promise((resolve, reject) => { rejectJoin = reject; });
  const oldJoin = h.render().joinOpportunity('red-cross-dagupan');
  const hiddenConflict = assert.rejects(oldJoin, error => error.status === 401 && error.data === undefined);
  await h.render().logout();
  rejectJoin(new api.ApiError('Changed', 409, {}, {reason:'active_participation_exists',participation_id:77}));
  await hiddenConflict;
  console.log('PASS: token persistence, restore/revocation/offline retry, profile state, logout/cleanup failures, duplicate submission lock');
}

/* ========================================
 * OPTIONAL LIVE LARAVEL CHECK
 * Creates one labeled test account, exercises the actual service, and revokes
 * all issued tokens. No existing account or backend files are changed.
 * ======================================== */
async function liveChecks() {
  throw new Error('Live automatic registration requires email verification. Use the app with an authorized test inbox; this script does not bypass codes or send test mail.');
}

(async () => { await requestChecks(); await providerChecks(); if (process.argv.includes('--live')) await liveChecks(); })()
  .catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });

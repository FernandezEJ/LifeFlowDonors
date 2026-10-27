// Offline root/native-config checks. Android rendering/cutouts still require device QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    assert.ok(name in imports, `Unexpected import: ${name}`);return imports[name];
  } }, { filename: file });
  return module.exports;
}
const jsx = (type, props, key) => ({ type, props, key });
function render(node) {
  if (Array.isArray(node)) return node.map(render);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return render(node.type(node.props));
  return { ...node, props: { ...node.props, children: render(node.props?.children) } };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const find = (tree, type) => nodes(tree).find(node => node.type === type);
const palette = load('src/constants/theme.ts', { 'react-native': { Platform: { select: options => options.default } } }).LifeFlowColors;
let scheme = 'light', segments = ['(auth)', 'welcome'], retries = 0;
let session = { user: null, restoring: false, sessionError: null, restore: () => { retries++; } };
// Execute the root components while leaving navigation/native views mocked.
const stack = props => jsx('Stack', props);
stack.Screen = 'Stack.Screen';stack.Protected = 'Stack.Protected';
const root = load('src/app/_layout.tsx', {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@/constants/theme': { LifeFlowColors: palette },
  '@/contexts/auth-context': { AuthProvider: 'AuthProvider', useAuth: () => session },
  '@/contexts/notification-context': { NotificationProvider: 'NotificationProvider' },
  'expo-router': { Stack: stack, useSegments: () => segments },
  'expo-router/react-navigation': { DefaultTheme: { colors: { background: '#fff' } }, DarkTheme: { dark: true, colors: { background: '#000' } }, ThemeProvider: 'ThemeProvider' },
  'react-native': { Text: 'Text', Button: 'Button', ActivityIndicator: 'ActivityIndicator' },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-status-bar': { StatusBar: 'StatusBar' }, '@/hooks/use-color-scheme': { useColorScheme: () => scheme },
  'expo-splash-screen': { setOptions() {} },
});
assert.equal(typeof root.default, 'function');
const draw = () => render(jsx(root.default));
const lightRoutes = [
  ['(auth)', 'welcome'], ['(auth)', 'onboarding1'], ['(auth)', 'onboarding2'], ['(auth)', 'login'], ['(auth)', 'register'], ['(auth)', 'forgot-password'],
  ['(tabs)'], ...['index', 'activity', 'points', 'status', 'profile'].map(tab => ['(tabs)', tab]),
  ['activity', '[id]'], ['announcement', '[id]'], ['announcements'], ['notifications'], ['notification-settings'],
  ['redeem'], ['voucher'], ['my-vouchers'], ['profile-settings'], ['profile-settings', '[setting]'], ['help-about'], ['evaluation'],
];
const flowieRoutes = [['flowie'], ['flowie-history'], ['flowie-recently-deleted'], ['flowie-conversation', '[id]']];
let cases = 0;
for (scheme of ['light', 'dark']) {
  for (segments of [...lightRoutes, ...flowieRoutes]) {
    for (const user of [null, { id: 42 }]) {
      session = { ...session, user, restoring: false, sessionError: null };
      const tree = draw(), bar = find(tree, 'StatusBar'), navigator = find(tree, 'Stack');
      const expected = user && scheme === 'dark' && flowieRoutes.some(route => route[0] === segments[0]) ? 'light' : 'dark';
      assert.equal(nodes(tree).filter(node => node.type === 'StatusBar').length, 1);
      assert.equal(bar.props.style, expected);assert.equal(bar.props.hidden, false);
      assert.equal(bar.props.backgroundColor, undefined);assert.equal(bar.props.translucent, undefined);
      assert.equal(navigator.props.screenOptions.statusBarStyle, expected, 'Native-stack and JS foreground agree');
      assert.equal(navigator.props.screenOptions.statusBarHidden, false);
      const navigationTheme=find(tree,'ThemeProvider').props.value;
      if(scheme==='dark'&&flowieRoutes.some(route=>route[0]===segments[0]))assert.equal(navigationTheme.dark,true);
      else {assert.equal(navigationTheme.colors.background,palette.cream);assert.equal(navigationTheme.colors.card,palette.surface);assert.equal(navigationTheme.colors.text,palette.text);}
      assert.equal(find(tree, 'SafeAreaView'), undefined, 'No global inset wrapper around screens that already handle safe areas');
      const guards = nodes(tree).filter(node => node.type === 'Stack.Protected');
      assert.deepEqual(guards.map(node => node.props.guard), [!user, !!user]);
      assert.equal(find(tree, 'NotificationProvider').key, user?.id ?? 'guest');
      const registered = nodes(tree).filter(node => node.type === 'Stack.Screen').map(node => node.props.name);
      for (const name of ['(auth)', '(tabs)', 'activity/[id]', 'redeem', 'flowie', 'notifications']) assert.ok(registered.includes(name));
      cases++;
    }
  }
  for (const gate of ['restore', 'error']) {
    session = { ...session, user: { id: 42 }, restoring: gate === 'restore', sessionError: gate === 'error' ? 'Cannot restore session.' : null };
    segments = ['flowie'];const tree = draw();
    assert.equal(find(tree, 'StatusBar').props.style, 'dark');assert.equal(find(tree, 'StatusBar').props.hidden, false);
    assert.equal(find(tree, 'Stack'), undefined);
    assert.equal(find(tree, 'SafeAreaView').props.style.backgroundColor, palette.cream);
    assert.equal(find(tree, 'SafeAreaView').props.edges, undefined, 'Use all actual insets with no hardcoded status-bar height');
    if (gate === 'error') { find(tree, 'Button').props.onPress();assert.equal(retries, scheme === 'light' ? 1 : 2); }
    else assert.ok(find(tree, 'ActivityIndicator'));
    cases++;
  }
}
// Startup native defaults use the supported installed plugin's semantic foreground API.
const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const plugin = config.plugins.find(value => Array.isArray(value) && value[0] === 'expo-status-bar');
assert.deepEqual(plugin[1], { style: 'dark', hidden: false });
const nativePlugin = load('node_modules/expo-status-bar/plugin/src/withStatusBar.ts', {
  'expo/config-plugins': require('expo/config-plugins'), '../../package.json': require('expo-status-bar/package.json'),
});
const resources = { resources: { style: [{ $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' }, item: [] }] } };
const compiledStyles = nativePlugin.setAndroidStatusBarStyles(resources, plugin[1]);
const items = compiledStyles.resources.style.find(style => style.$.name === 'AppTheme').item;
assert.equal(items.find(item => item.$.name === 'android:windowLightStatusBar')._, 'true');
assert.equal(items.find(item => item.$.name === 'expoStatusBarHidden')._, 'false');
assert.ok(!items.some(item => /statusBarColor|windowTranslucentStatus/.test(item.$.name)));
console.log(`PASS: ${cases} light/dark guest/donor/route/session cases; dark icons on light screens, Flowie contrast/restoration, single persistent visible status bar, matching native-stack options, startup plugin dark-icon resources, safe-area gate and unchanged route guards/retry`);

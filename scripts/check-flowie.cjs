/* ========================================
 * FLOWIE LOCAL EXPERIENCE CHECKS
 * Runs real screen/component handlers with React/native boundaries mocked.
 * Any unexpected import or network attempt fails; no device verification is claimed.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(path, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name.endsWith('.png')) return name;
    if (name === '@/components/tab-skeleton') return { TabSkeleton: 'TabSkeleton' };
    if (!(name in imports)) throw Error('Unexpected import: ' + name);
    return imports[name];
  }, setInterval:()=>0, clearInterval:()=>{}, fetch: () => { throw Error('Component checks must not make network calls.'); }, ...globals });
  return module.exports;
}
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const native = { View:'View', Text:'Text', Pressable:'Pressable', Image:'Image', FlatList:'FlatList', TextInput:'TextInput',
  KeyboardAvoidingView:'KeyboardAvoidingView', ScrollView:'ScrollView', Platform:{OS:'android'}, StyleSheet:{create:x=>x}, useWindowDimensions:()=>({width:360}) };
const shared = { 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'}, 'react-native':native,
  '@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'}, 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'} };
(async () => {

const preview = load('src/services/flowie-preview.ts');
let theme = 'light';
const components = load('src/components/flowie-components.tsx', {
  ...shared, '@/components/home-donation-reminder':{HomeDonationReminder:'Reminder'},'@/constants/flowie-mascots':load('src/constants/flowie-mascots.ts'), '@/hooks/use-color-scheme':{useColorScheme:()=>theme}, '@/services/flowie-preview':preview,
});

// ========================================
// ALLOWLIST, LOCAL CONTENT AND COMPONENT CONTRACT
// Unknown text/actions cannot choose arbitrary routes. Every guided prompt has its own reply.
// ========================================
const expected = {open_evaluation:'/evaluation',open_points:'/(tabs)/points',open_status:'/(tabs)/status',open_activity:'/(tabs)/activity',open_vouchers:'/my-vouchers',open_notifications:'/notifications'};
for (const [action, route] of Object.entries(expected)) {
  assert.equal(preview.flowieAction(action).route, route);
  let selected;
  const card = components.FlowieActionCard({action,onAction:value=>{selected=value;}});
  card.props.onPress(); assert.equal(selected,action);
  const file = 'src/app/' + route.slice(1) + '.tsx';
  assert.ok(fs.existsSync(file), 'Missing existing route ' + file);
}
for (const invalid of ['https://example.com','/evaluation','__proto__','constructor',null,{}]) assert.equal(preview.flowieAction(invalid),null);
assert.equal(components.FlowieActionCard({action:'unknown',onAction(){}}),null);
assert.deepEqual(Array.from(preview.QUICK_PROMPTS), ['Where can I see my points?', 'My status', 'How often can I donate?']);
const messages = preview.QUICK_PROMPTS.map(prompt=>preview.previewResponse(prompt).message);
assert.equal(new Set(messages).size,3);
assert.equal(preview.previewResponse(preview.QUICK_PROMPTS[0]).action.type,'open_points');
assert.equal(preview.previewResponse(preview.QUICK_PROMPTS[1]).action.type,'open_status');
assert.match(messages[2],/last 3 months/);
assert.match(messages[2],/confirmed by the donation facility/);
assert.match(preview.previewResponse('How do points work?').message,/only after your donation is verified/);
assert.equal(preview.previewResponse('unrecognized question').message,preview.CUSTOM_PREVIEW);
const light=components.useFlowieColors(); theme='dark'; const dark=components.useFlowieColors();
assert.notEqual(light.background,dark.background); assert.notEqual(light.text,dark.text); theme='light';
const userBubble=components.UserMessageBubble({message:'long '.repeat(250)});
assert.equal(find(userBubble,'Text').props.children.length,1250);
assert.equal(userBubble.props.style[1].maxWidth,'86%');
const assistant=components.FlowieMessageBubble({item:{id:'1',role:'flowie',message:'Guide',action:{type:'open_points'},suggestions:['Prompt']},onAction(){},onPrompt(){}});
assert.ok(!nodes(assistant).some(n=>n.type===components.FlowieActionCard));
const responseBox = nodes(assistant).find(n=>n.type==='View' && n.props.children?.some?.(child=>child?.type==='Text'&&child.props.children==='Guide'));
assert.ok(responseBox);
assert.ok(nodes(responseBox).some(n=>n.type===components.FlowieInlineAction));
for (const [question, action, label] of [
  ['Where can I see my points?', 'open_points', 'View Points'],
  ['My status', 'open_status', 'View Status'],
  ['How do points work?', 'open_points', 'View Points & Rewards'],
  ['Where can I see my activities?', 'open_activity', 'View Activity'],
  ['Where are my vouchers?', 'open_vouchers', 'Open My Vouchers'],
  ['Can I donate today?', 'open_evaluation', 'Start Evaluation'],
]) {
  const response = preview.previewResponse(question);
  assert.equal(response.action.type, action);
  const tree = components.FlowieMessageBubble({item:{id:'test',role:'flowie',...response},onAction(){},onPrompt(){}});
  const box = nodes(tree).find(n=>n.type==='View' && n.props.children?.some?.(child=>child?.type==='Text'&&child.props.children===response.message));
  const inline = nodes(box).find(n=>n.type===components.FlowieInlineAction);
  assert.ok(inline, 'Action must share the explanation box');
  let selected;
  const button=components.FlowieInlineAction({...inline.props,onAction:value=>{selected=value;}});
  assert.equal(button.props.accessibilityLabel,label);
  button.props.onPress();assert.equal(selected,action);
}
assert.equal(components.FlowieInlineAction({action:'https://example.com',onAction(){}}),null);
let disabledCalls=0;
const disabled=components.FlowieInlineAction({action:'open_points',disabled:true,onAction(){disabledCalls++;}});
disabled.props.onPress();assert.equal(disabledCalls,0);assert.equal(disabled.props.disabled,true);
let customAction;
components.FlowieInlineAction({action:'open_points',label:'https://example.com',onAction:value=>{customAction=value;}}).props.onPress();
assert.equal(customAction,'open_points');
assert.ok(nodes(assistant).some(n=>n.type===components.QuickPromptChip));

// Home uses the real shared profile, stable short messages and the mascot-left / bubble-and-CTA-right composition.
const { host, flush } = require('./flowie-test-boundaries.cjs');
const routes = [], router = { push: route => routes.push(route) };
const h = host();
const timers = new Map(); let timerId = 0, profileLoads = 0;
const home = load('src/app/(tabs)/index.tsx', { ...shared, react: h.react,
  '@/services/announcement-presentation': {}, '@/components/home-donation-reminder': { HomeDonationReminder: 'Reminder' },
  '@/constants/flowie-mascots': load('src/constants/flowie-mascots.ts'), 'expo-router': { useRouter: () => router, useFocusEffect: h.focus },
  '@/components/notification-bell': { NotificationBell: 'Bell' }, '@/contexts/auth-context': { useAuth: () => auth },
  '@/services/donations': { boardItems: () => [] }, '@/services/api': { errorMessage: e => e.message } },
  { setInterval: (run, delay) => { const id = ++timerId; timers.set(id, { run, delay }); return id; }, clearInterval: id => timers.delete(id) });
const auth = { profile: null, loadProfile: async () => { profileLoads++; },
  opportunities: async () => ({ data: [] }), donationHistory: async () => ({ data: [] }) };
const render = () => h.render(home.default);
assert.ok(nodes(render()).some(n => n.type === 'TabSkeleton')); await flush();
assert.equal(profileLoads, 1);
assert.ok(nodes(render()).some(n => n.props?.accessibilityLabel === 'Loading greeting'));
assert.ok(!nodes(render()).some(n => n.type === 'Text' && [].concat(n.props.children).includes('Donor')));
auth.profile = { first_name: '  Inky  ' };
const greeting = nodes(render()).find(n => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children[0] === 'Hello, ');
assert.equal(greeting.props.children[1], 'Inky');
assert.ok(!nodes(render()).some(n => n.props?.accessibilityLabel === 'Loading greeting'));
for (const [width, fontScale] of [[320, 1], [360, 1], [768, 1], [320, 1.7]]) {
  native.useWindowDimensions = () => ({ width, fontScale });
  const tree = render();
  const mascot = nodes(tree).find(n => n.type === 'Image' && n.props.accessibilityLabel === 'Flowie, the LifeFlow assistant');
  const row = nodes(tree).find(n => n.type === 'View' && n.props.children?.includes?.(mascot));
  assert.equal(row.props.style.flexDirection, 'row');
  const right = row.props.children[1]; assert.equal(right.props.style.flex, 1);
  const bubble = right.props.children[0], button = right.props.children[1];
  const measuring = nodes(bubble).find(n => n.props?.importantForAccessibility === 'no-hide-descendants');
  assert.equal(measuring.props.style.opacity, 0); assert.equal(measuring.props.style.position, 'absolute');
  assert.equal(measuring.props.pointerEvents, 'none'); assert.equal(measuring.props.accessibilityElementsHidden, true);
  const measuredTexts = nodes(measuring).filter(n => n.type === 'Text'); assert.equal(measuredTexts.length, 4);
  const lines = fontScale > 1 ? 6 : 4;
  for (const measured of measuredTexts) measured.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: lines }, () => ({ height: 21 * fontScale })) } });
  const measuredRow = nodes(render()).find(n => n.type === 'View' && n.props.children?.[0]?.props?.accessibilityLabel === 'Flowie, the LifeFlow assistant');
  const height = measuredRow.props.children[1].props.children[0].props.style[1].height;
  assert.ok(height >= lines * 21 * fontScale + 18, 'Bubble must reserve the measured text height plus both 8 px vertical padding edges and 1 px borders');
  const rotation = [...timers.values()].find(timer => timer.delay === 4500);
  const messages = new Set();
  for (let index = 0; index < 4; index++) {
    const currentRow = nodes(render()).find(n => n.type === 'View' && n.props.style?.flexDirection === 'row' &&
      n.props.children?.[0]?.props?.accessibilityLabel === 'Flowie, the LifeFlow assistant');
    const currentBubble = currentRow.props.children[1].props.children[0];
    const message = find(currentBubble, 'Text');
    assert.ok(message.props.children.length <= 50, 'Home bubble must contain two short sentences');
    assert.equal(message.props.children.match(/[.!?]/g).length, 2);
    assert.equal(message.props.numberOfLines, undefined, 'Text must wrap without line truncation');
    assert.equal(currentBubble.props.style[1].height, height);
    messages.add(message.props.children); rotation.run();
  }
  assert.equal(messages.size, 4);
  assert.equal(find(button, 'Text').props.children, 'Ask Flowie');
  assert.equal(button.props.style({ pressed: false })[0].width, '100%');
  button.props.onPress(); assert.equal(routes.at(-1), '/flowie');
  assert.ok(!nodes(tree).some(n => n.type === 'Text' && n.props.children === 'Check Eligibility'));
}
const refresh = [...timers.values()].find(timer => timer.delay === 30000);
refresh.run(); await flush(); assert.equal(profileLoads, 2);
assert.ok(nodes(render()).some(n => n.type === 'Text' && n.props.children?.[1] === 'Inky'));
h.blur(); h.refocus(); await flush(); assert.equal(profileLoads, 3);
h.unmount();
assert.equal(timers.size, 0);
for (const pose of ['default', 'thinking', 'writing']) {
  const bubble = components.FlowieMessageBubble({ item: { id: 'state', role: 'flowie', message: 'Status' }, pose, onAction() {}, onPrompt() {} });
  assert.equal(find(bubble, 'Image').props.source, load('src/constants/flowie-mascots.ts').FLOWIE_MASCOTS[pose]);
}
console.log('Flowie checks passed: guide/action allowlist, prompts/evaluation, bubbles/themes/mascots, Home composition at 320/360/768 and larger fonts, two-sentence rotation with measured stable height/no line truncation, profile greeting/background refresh and CTA navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });

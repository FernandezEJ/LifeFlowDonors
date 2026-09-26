/* ========================================
 * FLOWIE LOCAL EXPERIENCE CHECKS
 * Runs real screen/component handlers with React/native boundaries mocked.
 * Any unexpected import or network attempt fails; no device verification is claimed.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const timers = new Map(); let timerId = 0;
const runTimer = delay => { const [id, timer] = [...timers.entries()][0] || []; assert.ok(timer, 'Expected pending reply timer'); assert.equal(timer.delay, delay); timers.delete(id); timer.fn(); };
const finishReply = () => { runTimer(1200); runTimer(400); };
const jsx = (type, props) => ({ type, props });
function load(path, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name.endsWith('.png')) return name;
    if (!(name in imports)) throw Error('Unexpected import: ' + name);
    return imports[name];
  }, setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;}, clearTimeout:id=>timers.delete(id), fetch: () => { throw Error('Flowie must not make network calls.'); } });
  return module.exports;
}
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const find = (tree, type) => nodes(tree).find(n => n.type === type);
const native = { View:'View', Text:'Text', Pressable:'Pressable', Image:'Image', FlatList:'FlatList', TextInput:'TextInput',
  KeyboardAvoidingView:'KeyboardAvoidingView', ScrollView:'ScrollView', Platform:{OS:'android'}, StyleSheet:{create:x=>x}, useWindowDimensions:()=>({width:360}) };
const shared = { 'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'}, 'react-native':native,
  '@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'}, 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'} };
(async () => {
const flush = async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
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

// ========================================
// SCREEN STATE, SEND LOCK AND CAREFUL SCROLLING
// State/refs persist across renders; rapid stale callbacks cannot resend consumed text.
// ========================================
let cleanup;
const slots=[];let cursor=0;const routes=[];let backs=0;
const router={push:r=>routes.push(r),replace:r=>routes.push(r),canGoBack:()=>true,back:()=>{backs++;}};
const react={
  useEffect:fn=>{const i=cursor++;if(!(i in slots)){slots[i]=true;cleanup=fn();}},
  useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},
};
let failChat=false, resolveChat, holdChat=false;const chatCalls=[];
const auth={flowieChat:async(message,history)=>{chatCalls.push({message,history});if(failChat)throw Error('Offline');if(holdChat)return new Promise(resolve=>{resolveChat=resolve;});return {reply:'Helpful AI reply'};}};
const screen=load('src/app/flowie.tsx',{...shared,react,'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>router},
  '@/contexts/auth-context':{useAuth:()=>auth},'@/components/flowie-components':components,'@/services/flowie-preview':preview});
const render=()=>{cursor=0;return screen.default();};
const list=()=>find(render(),'FlatList').props;
const input=()=>find(render(),'TextInput').props;
const send=()=>nodes(render()).find(n=>n.props?.accessibilityLabel==='Send message').props;
assert.equal(list().data.length,1);assert.equal(list().data[0].message,preview.FLOWIE_INTRO);
assert.equal(list().ListHeaderComponent,undefined);
assert.equal(list().data[0].message,'Hi! How can I help you today?');
assert.equal(nodes(render()).filter(n=>n.type==='Image').length,0);
const keyboardChildren=find(render(),'KeyboardAvoidingView').props.children;
assert.equal(keyboardChildren[1].type,'FlatList');
const pinned=find(keyboardChildren[0],components.FlowieActionCard);
assert.equal(pinned.props.action,'open_evaluation');
pinned.props.onAction('open_evaluation');assert.equal(routes.pop(),'/evaluation');
const utility=keyboardChildren[2];
assert.equal(nodes(utility).filter(n=>n.type===components.QuickPromptChip).length,3);
assert.ok(find(utility,'TextInput'));
assert.ok(nodes(utility).findIndex(n=>n.type===components.QuickPromptChip)<nodes(utility).findIndex(n=>n.type==='TextInput'));
assert.equal(find(render(),'KeyboardAvoidingView').props.behavior,'height');
native.Platform.OS='ios';assert.equal(find(render(),'KeyboardAvoidingView').props.behavior,'padding');native.Platform.OS='android';
assert.deepEqual(Array.from(find(render(),'SafeAreaView').props.edges),['top','bottom']);
assert.equal(input().multiline,true);assert.equal(input().maxLength,1000);
assert.equal(input().style[0].maxHeight,120);
assert.equal(send().disabled,true);input().onChangeText(' \n ');send().onPress();assert.equal(list().data.length,1);
input().onChangeText('What should I prepare?');const press=send().onPress;press();press();
assert.equal(list().data.length,2);assert.equal(list().data[1].message,'What should I prepare?');
assert.equal(find(list().ListFooterComponent,components.FlowieMessageBubble).props.pose,'thinking');
assert.equal(send().disabled,true);assert.equal(timers.size,1);
const busyChip=nodes(render()).find(n=>n.type===components.QuickPromptChip);busyChip.props.onPress(busyChip.props.label);assert.equal(list().data.length,2);
input().onChangeText('Keep my next draft');send().onPress();assert.equal(input().value,'Keep my next draft');
runTimer(1200);assert.equal(find(list().ListFooterComponent,components.FlowieMessageBubble).props.pose,'writing');assert.equal(list().data.length,2);
runTimer(400);assert.equal(list().ListFooterComponent,null);assert.equal(list().data.length,3);
input().onChangeText('');
assert.equal(list().data[2].message,preview.previewResponse('What should I prepare?').message);assert.equal(input().value,'');
let scrolls=0;list().ref.current={scrollToEnd:()=>{scrolls++;}};
list().onContentSizeChange();list().onContentSizeChange();assert.equal(scrolls,1);
list().onScroll({nativeEvent:{contentSize:{height:1800},contentOffset:{y:0},layoutMeasurement:{height:400}}});
list().onLayout();assert.equal(scrolls,1);
const chip=nodes(render()).find(n=>n.type===components.QuickPromptChip);
chip.props.onPress(chip.props.label);chip.props.onPress(chip.props.label);
assert.equal(list().data.length,4);finishReply();assert.equal(list().data.length,5);assert.equal(list().data.at(-1).message,messages[0]);
const reply=list().renderItem({item:list().data.at(-1)});
reply.props.onAction('open_evaluation');assert.equal(routes.at(-1),'/evaluation');
reply.props.onAction('https://example.com');assert.equal(routes.length,1);
nodes(render()).find(n=>n.props?.accessibilityLabel==='Open notifications').props.onPress();assert.equal(routes.at(-1),'/notifications');
nodes(render()).find(n=>n.props?.accessibilityLabel==='Go back').props.onPress();assert.equal(backs,1);
router.canGoBack=()=>false;nodes(render()).find(n=>n.props?.accessibilityLabel==='Go back').props.onPress();assert.equal(routes.at(-1),'/(tabs)');

// Known local app questions keep their deterministic inline actions.
for (const [question, action] of [['How do points work?', 'open_points'], ['Where can I see my activities?', 'open_activity'], ['Where are my vouchers?', 'open_vouchers'], ['Can I donate today?', 'open_evaluation']]) {
  input().onChangeText(question); send().onPress();finishReply();
  assert.equal(list().data.at(-1).action.type,action);
}
assert.equal(chatCalls.length,0);
for(let i=0;i<30;i++){input().onChangeText('Long conversation '+i);send().onPress();await flush();runTimer(400);}
assert.ok(list().data.length>60);
assert.equal(nodes(render()).filter(n=>n.type===components.QuickPromptChip).length,3);
assert.equal(nodes(render()).filter(n=>n.type===components.FlowieActionCard).length,1);

// Remote replies have no artificial thinking delay; retries reuse the same user bubble.
assert.ok(chatCalls.every(call=>call.history.length<=6));
const count=list().data.length;holdChat=true;
input().onChangeText('Tell me about aftercare');send().onPress();send().onPress();
assert.equal(list().data.length,count+1);assert.equal(timers.size,0);
assert.equal(find(list().ListFooterComponent,components.FlowieMessageBubble).props.pose,'thinking');
resolveChat({reply:'Rest after donating.'});await flush();assert.equal(timers.size,1);runTimer(400);
assert.equal(list().data.at(-1).source,'ai');assert.equal(list().data.at(-1).message,'Rest after donating.');holdChat=false;
failChat=true;input().onChangeText('Another question');send().onPress();await flush();
const failedCount=list().data.length;
const retry=nodes(list().ListFooterComponent).find(n=>n.props?.accessibilityLabel==='Retry Flowie reply');assert.ok(retry);
failChat=false;retry.props.onPress();retry.props.onPress();await flush();runTimer(400);
assert.equal(list().data.length,failedCount+1);assert.equal(list().data.at(-1).source,'ai');
const apiCalls=[];class ChatApiError extends Error {}
const chatApi=load('src/services/flowie-chat.ts',{'./api':{ApiError:ChatApiError,apiRequest:async(path,options)=>{apiCalls.push({path,options});return {reply:'Server reply'};}}});
await chatApi.requestFlowieChat('private-token','Question',Array.from({length:9},(_,i)=>({role:'user',text:String(i)})));
assert.equal(apiCalls[0].path,'/flowie/chat');assert.equal(apiCalls[0].options.token,'private-token');assert.equal(apiCalls[0].options.body.history.length,6);
assert.deepEqual(Object.keys(apiCalls[0].options.body),['message','history']);
// ========================================
// EXISTING HOME ENTRY POINT
// Run the real Home button callback without starting its unrelated board effects.
// ========================================
input().onChangeText('What should I prepare?');send().onPress();assert.equal(timers.size,1);cleanup();assert.equal(timers.size,0);
holdChat=true;input().onChangeText('Slow reply after leaving');send().onPress();const beforeLeave=list().data.length;cleanup();
resolveChat({reply:'Stale answer'});await flush();assert.equal(list().data.length,beforeLeave);assert.equal(timers.size,0);
for(const pose of ['default','thinking','writing']){
 const bubble=components.FlowieMessageBubble({item:{id:'state',role:'flowie',message:'Status'},pose,onAction(){},onPrompt(){}});
 assert.equal(find(bubble,'Image').props.source,load('src/constants/flowie-mascots.ts').FLOWIE_MASCOTS[pose]);
}
const home=load('src/app/(tabs)/index.tsx',{...shared,'@/components/home-donation-reminder':{HomeDonationReminder:'Reminder'},'@/constants/flowie-mascots':load('src/constants/flowie-mascots.ts'),react:{...react,useEffect(){},useCallback:fn=>fn},
  'expo-router':{useRouter:()=>router,useFocusEffect(){}},
  '@/components/notification-bell':{NotificationBell:'Bell'},'@/contexts/auth-context':{useAuth:()=>({opportunities:async()=>({data:[]})})},
  '@/services/donations':{boardItems:()=>[]},'@/services/api':{errorMessage:e=>e.message}});
slots.length=0;cursor=0;const tree=home.default();
const homeButton=nodes(tree).find(n=>n.type==='Pressable'&&nodes(n).some(t=>t.type==='Text'&&t.props.children==='Chat with Flowie'));
assert.ok(homeButton);homeButton.props.onPress();assert.equal(routes.at(-1),'/flowie');
assert.match(fs.readFileSync('src/app/_layout.tsx','utf8'),/Stack.Screen name="flowie"/);
console.log('Flowie checks passed: guided replies, action allowlist/routes, bubbles/themes, composer, duplicate sends, scrolling, Home and back navigation; local FAQs, mocked authenticated text chat, retry and timer cleanup.');

})().catch(error=>{console.error(error);process.exitCode=1;});

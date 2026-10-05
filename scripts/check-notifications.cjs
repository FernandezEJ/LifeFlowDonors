/* ========================================
 * NOTIFICATION CLIENT REGRESSION CHECKS
 * Runs real service/screen handlers with mocked native and API boundaries.
 * No real token, permission prompt, account, or push delivery is used.
 * ======================================== */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in imports)) throw new Error('Unexpected import: '+name);
    return imports[name];
  }, ...globals });
  return module.exports;
}
const jsx = (type, props) => ({ type, props });
const flush = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable'
  && nodes(n.props.children).some(child => child.type === 'Text' && child.props.children === label));

/* ========================================
 * API PAYLOADS AND SAFE DESTINATIONS
 * No request lets the client choose an owner or an arbitrary destination URL.
 * ======================================== */
let sent;
const service = load('src/services/notifications.ts', { './api': {
  apiRequest: async (path, options) => { sent = { path, ...options }; return {}; },
} });
async function serviceChecks() {
  await service.notificationApi.list('session', 2, true);
  assert.equal(sent.path, '/notifications?page=2&unread=1');
  await service.notificationApi.register('session', 'test-device-token');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.body)), { token: 'test-device-token', platform: 'android', provider: 'fcm' });
  assert.equal(sent.token, 'session');
  await service.notificationApi.unregister('session', 'test-device-token');
  assert.equal(sent.path, '/device-tokens/unregister');
  await service.notificationApi.read('session', 42);
  assert.equal(sent.path, '/notifications/42/read');
  assert.equal(sent.method, 'POST');
  await service.notificationApi.readAll('session');
  assert.equal(sent.path, '/notifications/read-all');
  assert.equal(service.notificationDestination({type:'donation_completed',data:{participation_id:12}}).params.id, '12');
  assert.equal(service.notificationDestination({type:'donation_needs_revision',data:{participation_id:12}}).pathname, '/activity/[id]');
  assert.equal(service.notificationDestination({type:'donation_cooldown_complete',data:null}).pathname, '/(tabs)/status');
  assert.equal(service.notificationDestination({type:'admin_announcement',data:{opportunity_id:8}}).pathname, '/announcement/[id]');
  for (const id of [-1,0,1.5,'12','../12',Number.MAX_SAFE_INTEGER+1,null]) {
    assert.equal(service.notificationDestination({type:'donation_rejected',data:{participation_id:id}}), null);
  }
  assert.equal(service.notificationDestination({type:'unknown',data:{participation_id:12}}), null);
}

/* ========================================
 * PERMISSION DENIAL, EXPLICIT OPT-IN AND NATIVE LIMITS
 * Passive registration never prompts; Android may report denied before the
 * first explicit ask. Expo Go/web/iOS never return mislabeled FCM tokens.
 * ======================================== */
async function permissionChecks() {
  let permission = { granted:false, canAskAgain:true, status:'denied' };
  let prompts = 0; let tokenReads = 0;
  const platform = { OS:'android' }, constants = { executionEnvironment:'bare' };
  const device = { isDevice:true };
  const native = {
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => { prompts++; return permission = { granted:true, canAskAgain:true, status:'granted' }; },
    setNotificationChannelAsync: async () => {},
    AndroidImportance: { DEFAULT:3 },
    getDevicePushTokenAsync: async () => { tokenReads++; return {type:'android',data:'test-device-token'}; },
  };
  const push = load('src/services/push-notifications.ts', {
    'expo-constants': {__esModule:true,default:constants}, 'expo-device':device,
    'react-native': {Platform:platform}, 'expo-notifications':native,
  });
  assert.equal((await push.getPushRegistration()).status,'denied');
  await push.getPushRegistration(); assert.equal(prompts,0); assert.equal(tokenReads,0);
  assert.equal((await push.getPushRegistration(true)).token,'test-device-token');
  assert.equal(prompts,1);
  await push.getPushRegistration(); assert.equal(prompts,1);
  permission = { granted:false,canAskAgain:false,status:'denied' };
  await push.getPushRegistration(true); assert.equal(prompts,1);
  for (const os of ['ios','web']) { platform.OS=os; assert.equal((await push.getPushRegistration(true)).status,'unavailable'); }
  platform.OS='android'; constants.executionEnvironment='storeClient';
  assert.equal((await push.getPushRegistration(true)).status,'unavailable');
  constants.executionEnvironment='bare'; device.isDevice=false;
  assert.equal((await push.getPushRegistration(true)).status,'unavailable');
  assert.equal(prompts,1);
}

/* ========================================
 * REAL INBOX HANDLERS AND SHARED BADGE
 * Checks pagination, confirmed reads, read failures, read-all, and reselecting
 * a filter without clearing the inbox. No React test dependency is installed.
 * ======================================== */
async function screenChecks() {
  const slots=[]; let cursor=0, focused=false, focus; let countRefreshes=0, reads=0, readAll=0, failRead=false;
  const routes=[];
  let records=[
    { id:2,type:'donation_needs_revision',title:'Donation proof needs revision',message:'Please upload a clearer proof.',data:{participation_id:12},read_at:null,created_at:'2026-09-11T00:00:00Z' },
    { id:1,type:'admin_announcement',title:'Announcement',message:'Important',data:{opportunity_id:8},read_at:null,created_at:'2026-09-10T00:00:00Z' },
  ];
  const inbox={
    listNotifications:async (page,unread) => ({data:records.filter(row=>!unread||!row.read_at).slice(page-1,page),current_page:page,last_page:2,total:2}),
    readNotification:async id => {
      reads++; if(failRead)throw new Error('Offline');
      records=records.map(row=>row.id===id?{...row,read_at:'2026-09-11T12:00:00Z'}:row);
      return {notification:records.find(row=>row.id===id)};
    },
    readAllNotifications:async()=>{readAll++;records=records.map(row=>({...row,read_at:'2026-09-11T12:00:00Z'}));return {unread_count:0};},
  };
  const shared={ unreadCount:2,refreshCount:async()=>{countRefreshes++;},enablePush:async()=>{},pushStatus:'' };
  const react={
    useCallback:fn=>fn,
    useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef:initial=>{const i=cursor++;return slots[i]||=( {current:initial} );},
  };
  const imports={
    '@expo/vector-icons/MaterialIcons':{default:'Icon'},
    'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>({push:route=>routes.push(route),back(){}}),useFocusEffect:fn=>{if(!focused){focused=true;focus=fn;}}},
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'react-native':{FlatList:'FlatList',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/contexts/auth-context':{useAuth:()=>inbox},
    '@/contexts/notification-context':{useNotifications:()=>shared},
    '@/services/api':{errorMessage:e=>e.message},
    '@/services/notifications':service,
  };
  const screen=load('src/app/notifications.tsx',imports);
  const render=()=>{cursor=0;return screen.default();};
  const list=()=>nodes(render()).find(n=>n.type==='FlatList').props;
  render();focus();await flush();
  assert.equal(list().data.length,1);
  button(list().ListHeaderComponent,'All').props.onPress();
  assert.equal(list().data.length,1);
  button(list().ListFooterComponent,'Load more').props.onPress();await flush();
  assert.equal(list().data.length,2);
  let row=list().renderItem({item:list().data[0]});
  failRead=true;row.props.onPress();await flush();
  assert.equal(list().data[0].read_at,null);assert.equal(routes.length,0);
  failRead=false;row.props.onPress();row.props.onPress();await flush();
  assert.equal(reads,2);assert.ok(list().data[0].read_at);
  assert.equal(routes[0].pathname,'/activity/[id]');
  button(render(),'Mark all read').props.onPress();await flush();
  assert.equal(readAll,1);assert.ok(list().data.every(item=>item.read_at));
  assert.ok(countRefreshes>=3);
  const bell=load('src/components/notification-bell.tsx',imports);
  assert.equal(bell.NotificationBell().props.accessibilityLabel,'Open notifications, 2 unread');
  shared.unreadCount=0;
  assert.equal(nodes(bell.NotificationBell()).filter(n=>n.type==='Text').length,0);
}

/* ========================================
 * SHARED CONTEXT LIFECYCLE AND PUSH TAPS
 * Verifies badge coalescing, passive registration, explicit opt-in, listener
 * cleanup, and owned API resolution before a cold-start or foreground tap.
 * ======================================== */
async function contextChecks() {
  const slots=[];let cursor=0,first=true;const effects=[],listeners={};let countCalls=0,registrations=0;
  let permission=false,prompts=0,reads=0;const routes=[];let foreground;let currentUser={id:7};
  const notification={id:2,type:'donation_completed',data:{participation_id:12}};
  const native={
    setNotificationHandler(){},
    addNotificationReceivedListener:fn=>{listeners.received=fn;return {remove(){delete listeners.received;}};},
    addPushTokenListener:fn=>{listeners.token=fn;return {remove(){delete listeners.token;}};},
    addNotificationResponseReceivedListener:fn=>{listeners.tap=fn;return {remove(){delete listeners.tap;}};},
    getLastNotificationResponseAsync:async()=>null,
    clearLastNotificationResponseAsync:async()=>{},
  };
  const auth={
    notificationCount:async()=>{countCalls++;return {unread_count:3};},
    readNotification:async id=>{reads++;if(id!==2)throw new Error('Not found');return {notification};},
    registerDeviceToken:async()=>{registrations++;},unregisterDeviceToken:async()=>{},
  };
  const module=load('src/contexts/notification-context.tsx',{
    react:{
      createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,
      useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
      useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},
      useEffect:fn=>{if(first)effects.push(fn);},
    },
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{AppState:{addEventListener:(_,fn)=>{foreground=fn;return {remove(){foreground=null;}};}}},
    'expo-router':{useRouter:()=>({push:route=>routes.push(route)})},
    './auth-context':{useAuth:()=>({...auth,user:currentUser})},
    '@/services/notifications':service,
    '@/services/push-notifications':{
      nativeNotifications:async()=>native,
      getPushRegistration:async prompt=>{if(prompt){prompts++;permission=true;}return permission?{status:'enabled',token:'test-token'}:{status:'denied'};},
    },
  });
  const render=()=>{cursor=0;const tree=module.NotificationProvider({children:null});first=false;return tree.props.value;};
  render();const cleanups=effects.map(effect=>effect());await flush();
  assert.equal(render().unreadCount,3);
  await render().refreshCount();await render().refreshCount();assert.equal(countCalls,1);
  assert.equal(prompts,0);assert.equal(registrations,0);
  await render().enablePush();assert.equal(prompts,1);assert.equal(registrations,1);
  foreground('active');await flush();assert.equal(prompts,1);
  const tap=id=>({notification:{request:{identifier:'push-'+id,content:{data:{notification_id:String(id)}}}}});
  listeners.tap(tap(999));await flush();assert.equal(routes.length,0);
  listeners.tap(tap(2));await flush();assert.equal(routes[0].params.id,'12');
  listeners.tap(tap(2));await flush();assert.equal(reads,2);
  cleanups.forEach(cleanup=>cleanup?.());assert.equal(foreground,null);assert.equal(listeners.tap,undefined);
  currentUser=null;
}

async function reminderChecks() {
  const slots=[];let cursor=0,focus,cleanup,foreground,timer,requests=0;
  const user={id:42},routes=[];
  const record=id=>({notification:{id,type:'donation_reminder',data:{participation_id:88,reminder_date:'2026-09-21'},read_at:null},activity_title:'Tomorrow drive',event_date:'2026-09-22',start_time:'09:00',remaining_seconds:60});
  let records=[record(1)];
  const auth={user,homeReminders:async()=>{requests++;return {reminders:records,server_time:'2026-09-21T12:00:00Z'};}};
  const react={useCallback:fn=>fn,useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];}};
  const stored=new Map();let failSave=false;
  const secure={getItemAsync:async key=>stored.get(key)??null,setItemAsync:async(key,value)=>{if(failSave)throw Error('Storage unavailable');stored.set(key,value);}};
  const storage=()=>load('src/services/reminder-dismissal-storage.ts',{'expo-secure-store':secure}).reminderDismissalStorage;
  const web=()=>load('src/services/reminder-dismissal-storage.web.ts',{}, {localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}}).reminderDismissalStorage;
  await web().dismiss(99,9);assert.equal(await web().isDismissed(99,9),true);assert.equal(await web().isDismissed(98,9),false);assert.equal(await web().isDismissed(99,10),false);
  const build=()=>load('src/components/home-donation-reminder.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useFocusEffect:fn=>{focus=fn;},useRouter:()=>({push:route=>routes.push(route)})},
    'react-native':{Modal:'Modal',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x},AppState:{addEventListener:(_,fn)=>{foreground=fn;return {remove:()=>{foreground=null;}};}}},
    '@/contexts/auth-context':{useAuth:()=>auth},'@/services/notifications':service,
    '@/services/reminder-dismissal-storage':{reminderDismissalStorage:storage()},
  },{setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;}});
  let module=build();
  const render=()=>{cursor=0;return module.HomeDonationReminder();};
  render();cleanup=focus();await flush();assert.ok(button(render(),'Got it'));
  const before=requests;button(render(),'Got it').props.onPress();await flush();assert.equal(render(),null);assert.equal(requests,before,'Dismissal does not mark read/delete');
  cleanup();render();cleanup=focus();await flush();assert.equal(render(),null,'Same reminder stays suppressed across focus');
  cleanup();slots.length=0;module=build();render();cleanup=focus();await flush();assert.equal(render(),null,'Dismissal survives fresh module/app restart');
  assert.equal(await storage().isDismissed(42,1),true);assert.equal(await storage().isDismissed(43,1),false);
  auth.user={id:43};cleanup();render();cleanup=focus();await flush();assert.ok(render(),'Different donor is not suppressed');
  auth.user=user;cleanup();render();cleanup=focus();await flush();
  records=[record(6)];foreground('active');await flush();failSave=true;button(render(),'Got it').props.onPress();await flush();assert.ok(button(render(),'Got it'),'Storage failure keeps popup for retry');assert.equal(await storage().isDismissed(42,6),false);
  failSave=false;button(render(),'Got it').props.onPress();await flush();assert.equal(render(),null);
  records=[record(2)];foreground('active');await flush();const view=button(render(),'View Activity');view.props.onPress();view.props.onPress();await flush();
  assert.equal(routes.length,1);assert.equal(routes[0].pathname,'/activity/[id]');assert.equal(routes[0].params.id,'88');
  records=[record(3)];foreground('active');await flush();assert.ok(render());timer();assert.equal(render(),null,'Popup hides at server deadline');
  records=[record(4)];foreground('active');await flush();records=[];button(render(),'View Activity').props.onPress();await flush();assert.equal(routes.length,1,'No navigation after server invalidates reminder');
  records=[record(5)];foreground('active');await flush();foreground('background');assert.equal(render(),null);
  cleanup();assert.equal(foreground,null);assert.equal(timer,null);
  assert.equal(service.notificationDestination(record(1).notification).params.id,'88');
  await service.notificationApi.reminders('session');assert.equal(sent.path,'/notifications/reminders');
}

(async()=>{
  await reminderChecks();console.log('PASS: reminder popup dismiss/navigation, session suppression, expiry, foreground and server revalidation');
  await serviceChecks();console.log('PASS: notification API payloads and safe navigation');
  await permissionChecks();console.log('PASS: passive denial, explicit permission, token refresh, Expo Go/web/iOS/device guards');
  await contextChecks();console.log('PASS: badge lifecycle/coalescing, opt-in registration, owned push taps and listener cleanup');
  await screenChecks();console.log('PASS: inbox pagination, confirmed reads/read-all, failure handling, duplicate lock, shared unread badge');
})().catch(error=>{console.error(error);process.exitCode=1;});

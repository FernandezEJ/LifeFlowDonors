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
  if (!imports['@/components/load-state'] && path !== 'src/components/load-state.tsx' && imports['react/jsx-runtime'] && imports['@expo/vector-icons/MaterialIcons'] && imports.react) imports = { ...imports, '@/components/load-state': load('src/components/load-state.tsx', imports, globals) };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {if (name === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}});
    if (name === '@/components/tab-skeleton') return { TabSkeleton: 'TabSkeleton' };
    if (!(name in imports)) throw new Error('Unexpected import: '+name);
    return imports[name];
  }, ...globals });
  return module.exports;
}
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
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
  const announcement=service.notificationDestination({id:17,type:'admin_announcement',data:{opportunity_id:8}});
  assert.equal(announcement.pathname, '/announcement/[id]');assert.equal(announcement.params.id,'8');assert.equal(announcement.params.notificationId,'17');
  for(const id of [undefined,0,-1,1.5,'17',Number.MAX_SAFE_INTEGER+1])assert.equal(service.notificationDestination({id,type:'admin_announcement',data:{opportunity_id:8}}),null);
  await service.notificationApi.announcement('session',17);assert.equal(sent.path,'/notifications/17/announcement');assert.equal(sent.token,'session');assert.equal(sent.body,undefined);
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
  const beforeRefresh = tokenReads;
  assert.equal((await push.getPushRegistration(false, {type:'android',data:'event-supplied-token'})).token,'event-supplied-token');
  assert.equal(tokenReads,beforeRefresh,'A refresh event must never fetch another native token');
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
  const { host } = require('./flowie-test-boundaries.cjs');
  const create = (initial={}) => {
    const life=host(),routes=[],calls=[];
    const control={reads:0,all:0,failRead:false,failAll:false,failList:false,listGate:null,readGate:null,...initial};
    let records=[
      {id:2,type:'donation_needs_revision',title:'Donation proof needs revision',message:'Please upload a clearer proof.',data:{participation_id:12},read_at:null,created_at:'2026-09-11T00:00:00Z'},
      {id:1,type:'admin_announcement',title:'Announcement',message:'Important',data:{opportunity_id:8},read_at:null,created_at:'2026-09-10T00:00:00Z'},
    ];
    const shared={unreadCount:2,refreshCount:async()=>{shared.unreadCount=records.filter(row=>!row.read_at).length;}};
    const auth={
      listNotifications:async(page,unread)=>{
        calls.push([page,unread]);const data=records.filter(row=>!unread||!row.read_at);
        const result={data:data.slice(page-1,page),current_page:page,last_page:Math.max(1,data.length),total:data.length};
        if(control.listGate)await control.listGate;
        if(control.failList)throw Error('Offline');return result;
      },
      readNotification:async id=>{
        control.reads++;if(control.readGate)await control.readGate;if(control.failRead)throw Error('Read failed');
        records=records.map(row=>row.id===id?{...row,read_at:'2026-09-11T12:00:00Z'}:row);
        return {notification:records.find(row=>row.id===id)};
      },
      readAllNotifications:async()=>{
        control.all++;await Promise.resolve();if(control.failAll)throw Error('Read all failed');
        records=records.map(row=>({...row,read_at:'2026-09-11T12:00:00Z'}));return {unread_count:0};
      },
    };
    const imports={
      '@expo/vector-icons/MaterialIcons':{default:'Icon'},
      'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>({push:route=>routes.push(route),back:()=>routes.push('back'),canGoBack:()=>true}),useFocusEffect:life.focus},
      react:life.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
      'react-native':{FlatList:'FlatList',Modal:'Modal',ScrollView:'ScrollView',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}},
      'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
      '@/contexts/auth-context':{useAuth:()=>auth},'@/contexts/notification-context':{useNotifications:()=>shared},
      '@/services/api':{errorMessage:e=>e.message},'@/services/notifications':service,
    };
    const screen=load('src/app/notifications.tsx',imports);
    const render=()=>life.render(()=>screen.default());const list=()=>nodes(render()).find(n=>n.type==='FlatList').props;
    const action=label=>nodes(render()).concat(nodes(list().ListHeaderComponent)).find(n=>n.props?.accessibilityLabel===label);
    render();
    return {control,routes,calls,shared,imports,render,list,action,life,setRecords:value=>{records=value;}};
  };
  let ui=create();await flush();assert.equal(ui.list().data.length,1);
  button(ui.list().ListHeaderComponent,'All').props.onPress();assert.equal(ui.list().data.length,1);
  ui.control.failList=true;const more=button(ui.list().ListFooterComponent,'Load more');more.props.onPress();more.props.onPress();await flush();
  assert.equal(ui.list().data.length,1,'A failed next page keeps existing notifications');
  ui.control.failList=false;const retryPage=ui.action('Retry notifications');retryPage.props.onPress();retryPage.props.onPress();await flush();
  assert.equal(ui.calls.at(-1)[0],2,'Retry repeats the failed next page');
  assert.equal(ui.list().data.length,2);assert.equal(ui.calls.length,3,'Repeated fetch/retry presses never duplicate a page');
  assert.equal(ui.list().keyExtractor(ui.list().data[0]),'2');
  let row=ui.list().renderItem({item:ui.list().data[0]});assert.equal(row.props.accessibilityRole,'button');
  assert.equal(nodes(row).filter(n=>n.type==='Pressable').length,1);assert.ok(nodes(row).some(n=>n.props?.numberOfLines===2));
  assert.match(row.props.accessibilityLabel,/Unread/);assert.ok(nodes(row).some(n=>n.props?.name==='chevron-right'));
  ui.control.failRead=true;row.props.onPress();await flush();assert.equal(ui.list().data[0].read_at,null);assert.equal(ui.routes.length,0);
  ui.control.failRead=false;row.props.onPress();row.props.onPress();await flush();
  assert.equal(ui.control.reads,2);assert.ok(ui.list().data[0].read_at);assert.equal(ui.routes.length,1);assert.equal(ui.routes[0].pathname,'/activity/[id]');
  ui.control.failAll=true;ui.action('Mark all read').props.onPress();await flush();assert.equal(ui.shared.unreadCount,1);assert.equal(ui.list().data[1].read_at,null);
  assert.ok(nodes(ui.list().ListHeaderComponent).some(n=>n.props?.accessibilityRole==='alert'));
  ui.control.failAll=false;ui.control.failList=true;const all=ui.action('Mark all read');all.props.onPress();all.props.onPress();await flush();
  assert.equal(ui.control.all,2);assert.equal(ui.shared.unreadCount,0,'Confirmed read-all updates the server count even when the subsequent list fetch fails');
  assert.ok(nodes(ui.list().ListHeaderComponent).some(n=>n.props?.accessibilityRole==='alert'));
  ui.control.failList=false;ui.action('Retry notifications').props.onPress();await flush();
  assert.ok(ui.list().data.every(item=>item.read_at));assert.equal(ui.action('Mark all read').props.disabled,true);
  button(ui.list().ListFooterComponent,'Load more').props.onPress();await flush();
  const announcementRow=ui.list().renderItem({item:ui.list().data.find(item=>item.type==='admin_announcement')});
  announcementRow.props.onPress();await flush();let announcementRoute=ui.routes.at(-1);
  assert.equal(announcementRoute.pathname,'/announcement/[id]');assert.equal(announcementRoute.params.id,'8');assert.equal(announcementRoute.params.notificationId,'1');
  const readCount=ui.shared.unreadCount;announcementRow.props.onPress();await flush();announcementRoute=ui.routes.at(-1);
  assert.equal(announcementRoute.params.notificationId,'1');assert.equal(ui.shared.unreadCount,readCount,'Reopening a read announcement keeps unread tracking unchanged');
  assert.ok(!JSON.stringify(ui.list().ListHeaderComponent).includes('Enable important notifications'));
  ui.action('Notification Settings').props.onPress();assert.equal(ui.routes.at(-1),'/notification-settings');
  ui.action('Go back').props.onPress();assert.equal(ui.routes.at(-1),'back');
  const bellHost=host();const bell=load('src/components/notification-bell.tsx',{...ui.imports,react:bellHost.react,'expo-router':{...ui.imports['expo-router'],useFocusEffect:bellHost.focus}});
  const bellView=()=>bellHost.render(bell.NotificationBell);assert.equal(bellView().props.accessibilityLabel,'Open notifications, 0 unread');
  assert.equal(nodes(bellView()).filter(n=>n.type==='Text').length,0);bellHost.unmount();ui.life.unmount();

  ui=create({failList:true});await flush();assert.equal(ui.list().data.length,0);
  assert.equal(ui.list().ListEmptyComponent,null,'An initial failure is an error, never an empty inbox');
  ui.control.failList=false;ui.action('Retry notifications').props.onPress();await flush();assert.equal(ui.list().data.length,1);
  ui.setRecords([{id:9,type:'admin_announcement',title:'Full message',message:'Complete notification text. '.repeat(90),data:null,read_at:null,created_at:'invalid'}]);
  ui.list().onRefresh();await flush();row=ui.list().renderItem({item:ui.list().data[0]});assert.ok(!nodes(row).some(n=>n.props?.name==='chevron-right'));
  row.props.onPress();await flush();assert.equal(ui.routes.length,0);
  const modal=()=>nodes(ui.render()).find(n=>n.type==='Modal');assert.equal(modal().props.visible,true);
  assert.ok(nodes(modal()).some(n=>n.type==='Text'&&n.props.selectable&&n.props.children.length>2000));
  modal().props.onRequestClose();assert.equal(modal().props.visible,false);
  button(ui.list().ListHeaderComponent,'Unread (0)').props.onPress();ui.render();await flush();assert.equal(ui.calls.at(-1)[1],true);assert.equal(ui.list().data.length,0);
  assert.match(JSON.stringify(ui.list().ListEmptyComponent),/caught up/);ui.life.unmount();

  ui=create();await flush();let finish;
  const oldMore=button(ui.list().ListFooterComponent,'Load more');
  ui.control.listGate=new Promise(resolve=>{finish=resolve;});ui.list().onRefresh();
  ui.setRecords([{id:9,type:'admin_announcement',title:'Unread only',message:'Full text',data:null,read_at:null,created_at:null}]);
  button(ui.list().ListHeaderComponent,'Unread (2)').props.onPress();ui.control.listGate=null;ui.render();await flush();
  assert.equal(ui.list().data[0].id,9);
  const before=ui.calls.length;oldMore.props.onPress();assert.equal(ui.calls.length,before,'Old filter handlers cannot fetch pages for a new filter');
  finish();await flush();assert.equal(ui.list().data[0].id,9,'A late All response cannot replace the new Unread list');
  ui.list().renderItem({item:ui.list().data[0]}).props.onPress();await flush();
  assert.equal(ui.list().data.length,0);assert.equal(ui.calls.at(-1)[0],1,'Read-on-tap restarts Unread pagination without skipping records');
  assert.equal(nodes(ui.render()).find(n=>n.type==='Modal').props.visible,true,'Full message stays accessible after the row leaves Unread');
  assert.match(JSON.stringify(ui.list().ListEmptyComponent),/caught up/);
  ui.life.unmount();
  ui=create();await flush();ui.control.readGate=new Promise(resolve=>{finish=resolve;});
  ui.list().renderItem({item:ui.list().data[0]}).props.onPress();ui.life.unmount();finish();await flush();assert.equal(ui.routes.length,0,'A response after leaving the inbox cannot navigate');
  const layout=fs.readFileSync('src/app/_layout.tsx','utf8');assert.match(layout,/NotificationProvider key={user\?\.id/);
  assert.ok(layout.slice(layout.indexOf('<Stack.Protected guard={!!user}>')).includes('name="notification-settings"'));
}

/* ========================================
 * SHARED CONTEXT LIFECYCLE AND PUSH TAPS
 * Verifies badge coalescing, passive registration, explicit opt-in, listener
 * cleanup, and owned API resolution before a cold-start or foreground tap.
 * ======================================== */
function notificationHarness(granted = false, owner = 7) {
  const slots=[],effects=[],listeners={},routes=[],registrations=[],removals=[];
  let cursor=0,first=true,foreground,session=1,now=100000000;
  const control={granted,token:'initial-test-token',lookup:null,register:null,tokenReads:0,prompts:0,countCalls:0,reads:0};
  const native={
    setNotificationHandler(){}, AndroidImportance:{DEFAULT:3},
    getPermissionsAsync:async()=>({granted:control.granted,canAskAgain:true,status:control.granted?'granted':'denied'}),
    requestPermissionsAsync:async()=>{control.prompts++;control.granted=true;return {granted:true};},
    setNotificationChannelAsync:async()=>{},
    getDevicePushTokenAsync:async()=>{
      control.tokenReads++;
      const token=control.lookup?await control.lookup:{type:'android',data:control.token};
      // Match the installed Android SDK: native token lookup emits a refresh event.
      listeners.token?.(token);
      return token;
    },
    addNotificationReceivedListener:fn=>{listeners.received=fn;return {remove(){delete listeners.received;}};},
    addPushTokenListener:fn=>{listeners.token=fn;return {remove(){delete listeners.token;}};},
    addNotificationResponseReceivedListener:fn=>{listeners.tap=fn;return {remove(){delete listeners.tap;}};},
    getLastNotificationResponseAsync:async()=>null,clearLastNotificationResponseAsync:async()=>{},
  };
  const push=load('src/services/push-notifications.ts',{
    'expo-constants':{__esModule:true,default:{executionEnvironment:'bare'}},'expo-device':{isDevice:true},
    'react-native':{Platform:{OS:'android'}},'expo-notifications':native,
  });
  const auth={user:{id:owner},
    notificationCount:async()=>{control.countCalls++;return {unread_count:3};},
    readNotification:async id=>{control.reads++;if(id!==2)throw new Error('Not found');return {notification:{id:2,type:'donation_completed',data:{participation_id:12}}};},
    captureDeviceTokenSession:()=>{
      const captured=session;
      return {isCurrent:()=>captured===session,
        register:async token=>{assert.equal(captured,session);registrations.push([owner,token]);if(control.register)await control.register;return {registered:true};},
        unregister:async token=>{assert.equal(captured,session);removals.push(token);return {removed:true};},
      };
    },
  };
  const module=load('src/contexts/notification-context.tsx',{
    react:{createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,
      useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
      useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},useEffect:fn=>{if(first)effects.push(fn);}},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{AppState:{addEventListener:(_,fn)=>{foreground=fn;return {remove(){foreground=null;}};}}},
    'expo-router':{useRouter:()=>({push:route=>routes.push(route)})},'./auth-context':{useAuth:()=>auth},
    '@/services/notifications':service,'@/services/push-notifications':push,
  },{Date:class extends Date {static now(){return now;}}});
  const render=()=>{cursor=0;const tree=module.NotificationProvider({children:null});first=false;return tree.props.value;};
  render();const cleanups=effects.map(effect=>effect());
  return {control,listeners,routes,registrations,removals,render,
    foreground:()=>foreground?.('active'),advance:ms=>{now+=ms;},invalidate:()=>{session++;},
    dispose:()=>cleanups.forEach(cleanup=>cleanup?.())};
}

async function contextChecks() {
  let h=notificationHarness();await flush();
  assert.equal(h.render().unreadCount,3);
  await h.render().refreshCount();await h.render().refreshCount();assert.equal(h.control.countCalls,1);
  assert.equal(h.control.prompts,0);assert.equal(h.registrations.length,0);
  await h.render().enablePush();await flush();assert.equal(h.control.prompts,1);assert.equal(h.registrations.length,1);
  h.foreground();h.foreground();await flush();assert.equal(h.control.prompts,1);assert.equal(h.registrations.length,1);
  const tokenReads=h.control.tokenReads;
  h.listeners.token({type:'android',data:'rotated-test-token'});h.listeners.token({type:'android',data:'rotated-test-token'});
  await flush();assert.equal(h.control.tokenReads,tokenReads,'Refresh event must not read another native token');
  assert.equal(h.registrations.length,2);assert.equal(h.registrations[1][1],'rotated-test-token');
  h.control.token='rotated-test-token';h.advance(24*60*60*1000);h.foreground();await flush();
  assert.equal(h.registrations.length,3,'Daily heartbeat refreshes server last_seen_at');
  const tap=id=>({notification:{request:{identifier:'push-'+id,content:{data:{notification_id:String(id)}}}}});
  h.listeners.tap(tap(999));await flush();assert.equal(h.routes.length,0);
  h.listeners.tap(tap(2));await flush();assert.equal(h.routes[0].params.id,'12');
  h.listeners.tap(tap(2));await flush();assert.equal(h.control.reads,2);
  h.control.granted=false;h.foreground();await flush();assert.equal(h.removals[0],'rotated-test-token');
  h.listeners.token({type:'android',data:'denied-test-token'});await flush();
  assert.equal(h.registrations.length,3);assert.equal(h.control.prompts,1,'Revocation never prompts automatically');
  const stale=h.listeners.token;h.dispose();stale({type:'android',data:'stale-test-token'});await flush();
  assert.equal(h.listeners.token,undefined);assert.equal(h.registrations.length,3);

  // A rotated token arriving while another POST is in flight is serialized, never lost.
  h=notificationHarness(true);await flush();let finish;
  h.control.register=new Promise(resolve=>{finish=resolve;});
  h.listeners.token({type:'android',data:'first-rotation'});await flush();
  h.listeners.token({type:'android',data:'superseded-rotation'});h.listeners.token({type:'android',data:'latest-rotation'});
  await flush();assert.equal(h.registrations.length,2);
  finish();await flush();assert.deepEqual(h.registrations.map(row=>row[1]),['initial-test-token','first-rotation','latest-rotation']);
  h.dispose();

  // Native lookup resolving after logout/account switch or unmount must not POST.
  for(const end of ['logout','unmount']) {
    h=notificationHarness();await flush();let finishLookup;
    h.control.lookup=new Promise(resolve=>{finishLookup=resolve;});
    const pending=h.render().enablePush();await flush();const oldListener=h.listeners.token;
    if(end==='logout')h.invalidate();else h.dispose();
    finishLookup({type:'android',data:'old-account-test-token'});await pending;await flush();
    oldListener({type:'android',data:'late-test-token'});await flush();assert.equal(h.registrations.length,0);h.dispose();
  }
  h=notificationHarness(true);await flush();let finishOld;
  h.control.register=new Promise(resolve=>{finishOld=resolve;});
  h.listeners.token({type:'android',data:'in-flight-old-token'});await flush();
  h.listeners.token({type:'android',data:'queued-old-token'});h.invalidate();h.dispose();
  const next=notificationHarness(true,8);await flush();finishOld();await flush();
  assert.equal(h.registrations.length,2,'Old session cannot drain its queued rotation into the next login');
  assert.deepEqual(next.registrations,[[8,'initial-test-token']]);next.dispose();
  h=notificationHarness(false);await flush();
  assert.equal(h.control.tokenReads,0);assert.equal(h.control.prompts,0);assert.equal(h.removals.length,0);
  h.dispose();
}

async function reminderChecks() {
  const boundary=require('./flowie-test-boundaries.cjs');
  class ApiError extends Error { constructor(message,status){super(message);this.status=status;} }
  const record=id=>({notification:{id,type:'donation_reminder',data:{participation_id:200+id,opportunity_id:100+id},read_at:null},activity_title:'Tomorrow drive',event_date:'2026-11-01',start_time:'09:00',remaining_seconds:60});
  let records=[record(1)],acks=0,ackFailure=false,ackGate,readGate;const saved=new Set();
  const auth={user:{id:42},homeReminders:async()=>{
    const owner=auth.user.id,result=records.filter(row=>!saved.has(owner+':'+row.notification.data.opportunity_id));
    if(readGate)await readGate;return {reminders:result,server_time:'2026-10-31T12:00:00Z'};
  },acknowledgePreparation:async id=>{
    acks++;const owner=auth.user.id;if(ackGate)await ackGate;
    if(ackFailure)throw ackFailure;
    const row=records.find(row=>row.notification.id===id);if(!row)throw new ApiError('Stale',409);
    saved.add(owner+':'+row.notification.data.opportunity_id);return {acknowledged:true};
  }};
  const create=(dev=true)=>{
    const h=boundary.host(),routes=[],timers=new Map();let nextTimer=0,foreground;
    const module=boundary.load('src/components/home-donation-reminder.tsx',{
      ...boundary.shared,react:h.react,
      '@/contexts/auth-context':{useAuth:()=>auth},'@/services/notifications':service,'@/services/api':{ApiError},
      '@/components/donation-preparation-modal':{DonationPreparationModal:'PreparationModal'},
      'expo-router':{useFocusEffect:h.focus,useRouter:()=>({push:route=>routes.push(route)})},
      'react-native':{...boundary.native,AppState:{addEventListener:(_,callback)=>{foreground=callback;return {remove:()=>{foreground=null;}};}}},
    },{__DEV__:dev,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
    const view=()=>h.render(module.HomeDonationReminder);
    const modal=()=>boundary.nodes(view()).find(n=>n.type==='PreparationModal').props;
    return {h,view,modal,routes,timers,foreground:state=>foreground?.(state)};
  };
  let ui=create();ui.view();await flush();assert.equal(ui.modal().visible,true);
  let release;ackGate=new Promise(resolve=>{release=resolve;});ackFailure=Error('Offline');
  ui.modal().onAcknowledge();ui.modal().onAcknowledge();assert.equal(acks,1,'Duplicate button taps share a synchronous lock');
  release();await flush();assert.equal(ui.modal().visible,true);assert.match(ui.modal().error,/retry/);assert.equal(saved.size,0);
  ackGate=null;ackFailure=false;ui.modal().onAcknowledge();await flush();assert.equal(ui.modal().visible,false);assert.equal(saved.size,1);
  ui.h.blur();ui.h.refocus();await flush();assert.equal(ui.modal().visible,false);ui.h.unmount();
  ui=create();ui.view();await flush();assert.equal(ui.modal().visible,false,'A fresh app/device obeys the persisted server result');
  auth.user={id:43};ui.view();await flush();assert.equal(ui.modal().visible,true,'Acknowledgement never suppresses another donor');
  ui.modal().onBack();assert.equal(ui.modal().visible,false);const beforeBack=acks;ui.h.blur();ui.h.refocus();await flush();
  assert.equal(ui.modal().visible,false);assert.equal(acks,beforeBack,'Back avoids a popup loop without pretending server acknowledgement');
  records=[record(2),record(3)];ui.foreground('active');await flush();assert.equal(ui.modal().visible,true);
  ui.modal().onAcknowledge();await flush();assert.equal(ui.modal().visible,true,'Multiple activities are handled one at a time');
  ui.modal().onFlowie();ui.modal().onFlowie();await flush();assert.equal(ui.routes.length,1);
  assert.equal(ui.routes[0].pathname,'/flowie');assert.equal(ui.routes[0].params.preparationKey,'3');assert.equal(ui.routes[0].params.preparationTitle,'Tomorrow drive');
  assert.equal(ui.modal().visible,false);assert.equal(ui.timers.size,0);
  records=[record(4)];ui.foreground('active');await flush();for(const expire of ui.timers.values())expire();assert.equal(ui.modal().visible,false);
  records=[record(5)];ui.foreground('active');await flush();records=[];ui.modal().onFlowie();await flush();
  assert.equal(ui.modal().visible,false);assert.equal(ui.routes.length,1,'Server cancellation/expiry prevents Flowie navigation');
  records=[record(6)];ui.foreground('active');await flush();ui.foreground('background');assert.equal(ui.modal().visible,false);ui.h.unmount();
  // In-flight account changes and focus changes cannot show or navigate old reminders.
  auth.user={id:50};records=[record(7)];let releaseRead;readGate=new Promise(resolve=>{releaseRead=resolve;});
  ui=create();ui.view();records=[];auth.user={id:51};ui.view();releaseRead();readGate=null;await flush();
  assert.equal(ui.modal().visible,false);ui.h.unmount();
  auth.user={id:52};records=[record(8)];ui=create();ui.view();await flush();
  ackGate=new Promise(resolve=>{release=resolve;});ui.modal().onFlowie();auth.user={id:53};records=[];ui.view();release();await flush();
  assert.equal(ui.routes.length,0);assert.equal(ui.modal().visible,false);ui.h.unmount();ackGate=null;
  // Home has no preview entry point in either development or production.
  for(const dev of [true,false]) {
    ui=create(dev);ui.view();await flush();
    assert.ok(!boundary.nodes(ui.view()).some(n=>n.props?.accessibilityLabel==='Preview preparation reminder'));
    assert.equal(ui.modal().preview,undefined);assert.equal(ui.modal().visible,false);
    const before={acks,routes:ui.routes.length};ui.modal().onFlowie();ui.modal().onAcknowledge();await flush();
    assert.deepEqual({acks,routes:ui.routes.length},before,'No synthetic guide can acknowledge or navigate');ui.h.unmount();
  }
  // Explicit DP geometry must override the PNG's intrinsic 1200x900 dimensions.
  // These execute layout callbacks and render both before and after measurement.
  const imageBytes=fs.readFileSync('assets/images/DonationPreparationPoster.png');
  assert.equal(imageBytes.readUInt32BE(16),1200);assert.equal(imageBytes.readUInt32BE(20),900);
  const appearance=style=>Object.assign({},...[style].flat(Infinity).filter(Boolean));
  const createPopup=(dimensions,insets,dev=true)=>{
    const life=boundary.host(),environment={...dimensions},safe={...insets};
    const module=boundary.load('src/components/donation-preparation-modal.tsx',{
      ...boundary.shared,react:life.react,'react-native':{...boundary.native,useWindowDimensions:()=>environment},
      'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>safe},
    },{__DEV__:dev});
    const props={visible:true,busy:false,onBack(){},onFlowie(){},onAcknowledge(){}};
    return {life,environment,props,view:()=>life.render(()=>module.DonationPreparationModal(props))};
  };
  const scenarios=[
    [{width:320,height:568,fontScale:1},{top:24,bottom:16,left:0,right:0}],
    [{width:360,height:800,fontScale:1},{top:24,bottom:24,left:0,right:0}],
    [{width:390,height:844,fontScale:1},{top:47,bottom:34,left:0,right:0}],
    [{width:320,height:568,fontScale:2},{top:24,bottom:16,left:0,right:0}],
    [{width:360,height:640,fontScale:2},{top:32,bottom:24,left:0,right:0}],
    [{width:640,height:320,fontScale:1},{top:24,bottom:16,left:24,right:12}],
    [{width:640,height:320,fontScale:2},{top:24,bottom:16,left:24,right:12}],
  ];
  for(const [dimensions,insets] of scenarios){
    const popup=createPopup(dimensions,insets),view=popup.view;
    let tree=view(),all=boundary.nodes(tree);
    const card=all.find(n=>n.props?.accessibilityViewIsModal),cardStyle=appearance(card.props.style);
    const scroll=all.find(n=>n.type==='ScrollView');
    const footer=all.find(n=>n.type==='View'&&n.props.style?.flexShrink===0);
    const measure=all.find(n=>n.type==='View'&&n.props.style?.alignSelf==='stretch');
    const initialImageStyle=appearance(all.find(n=>n.type==='Image').props.style);
    assert.equal(typeof initialImageStyle.width,'number');assert.equal(typeof initialImageStyle.height,'number');
    assert.ok(initialImageStyle.width<1200&&initialImageStyle.height<900,'Intrinsic image dimensions are overridden even before native measurement');
    assert.equal(tree.type,'Modal');assert.equal(tree.props.animationType,'none');
    assert.equal(cardStyle.height,undefined,'Natural height never clips dynamic text');
    assert.ok(cardStyle.maxHeight<=(dimensions.height-insets.top-insets.bottom-32)*0.9);
    assert.ok(cardStyle.maxWidth<=400);assert.equal(cardStyle.backgroundColor,'#FFF9F2');
    assert.equal(all.filter(n=>n.type==='ScrollView').length,1);assert.equal(scroll.props.style.flexShrink,1);assert.equal(scroll.props.style.minHeight,0);
    assert.equal(boundary.nodes(scroll).filter(n=>n.type==='Pressable').length,0,'Both actions are outside the content scroll');
    assert.ok(card.props.children.includes(footer));assert.equal(footer.props.style.flexShrink,0);
    assert.equal(boundary.texts(scroll).filter(text=>typeof text==='string'&&text.startsWith('• ')).length,6);
    assert.ok(boundary.texts(scroll).includes('Your blood donation is tomorrow. Here are a few ways to prepare.'));
    assert.ok(all.some(n=>n.type==='SafeAreaView'&&n.props.edges.includes('bottom')&&n.props.style.backgroundColor==='rgba(0,0,0,0.28)'));
    const availableInner=Math.min(400,dimensions.width-insets.left-insets.right-32)-24;
    const measuredInner=availableInner-4,measuredFooter=dimensions.fontScale===2?176:116;
    measure.props.onLayout({nativeEvent:{layout:{width:measuredInner}}});
    footer.props.onLayout({nativeEvent:{layout:{height:measuredFooter}}});
    tree=view();all=boundary.nodes(tree);
    const image=all.find(n=>n.type==='Image'),fit=appearance(image.props.style);
    assert.equal(image.props.resizeMode,'contain');assert.ok(image.props.source.endsWith('DonationPreparationPoster.png'));
    const nativeImageStyle={width:1200,height:900,...fit};
    assert.equal(typeof nativeImageStyle.width,'number');assert.equal(typeof nativeImageStyle.height,'number');
    assert.ok(nativeImageStyle.width>0&&nativeImageStyle.width<=measuredInner);
    assert.ok(Math.abs(nativeImageStyle.height/nativeImageStyle.width-3/4)<1e-10);
    assert.equal(fit.aspectRatio,4/3);assert.equal(fit.transform,undefined);
    assert.ok(fit.height+measuredFooter+24<=cardStyle.maxHeight+1e-8,'Complete poster fits above the fixed actions');
    const frame=all.find(n=>n.type==='View'&&Array.isArray(n.props.style)&&appearance(n.props.style).overflow==='hidden'&&appearance(n.props.style).borderRadius===12);
    assert.ok(frame);assert.equal(appearance(frame.props.style).width,fit.width);assert.equal(appearance(frame.props.style).height,fit.height);
    assert.equal(appearance(frame.props.style).backgroundColor,undefined);
    if(dimensions.fontScale===1&&dimensions.width<=390)assert.ok(fit.height>=190&&fit.height<=260);
    for(const text of all.filter(n=>n.type==='Text')){assert.equal(text.props.allowFontScaling,undefined);assert.equal(text.props.numberOfLines,undefined);}
    const actions=all.filter(n=>n.type==='Pressable');assert.deepEqual(actions.map(n=>n.props.accessibilityLabel),['Prepare with Flowie','Got it']);
    assert.ok(actions.every(n=>appearance(n.props.style).minHeight>=48));
    popup.environment.width=dimensions.height;popup.environment.height=dimensions.width;
    const rotatedFit=appearance(boundary.nodes(view()).find(n=>n.type==='Image').props.style);
    assert.ok(rotatedFit.width<=Math.max(0,Math.min(400,popup.environment.width-insets.left-insets.right-32)-24));
    assert.ok(Math.abs(rotatedFit.height-rotatedFit.width*3/4)<1e-10);popup.life.unmount();
  }
  const popup=createPopup({width:360,height:800,fontScale:1},{top:24,bottom:24,left:0,right:0});let closes=0,prepares=0,acknowledges=0;
  popup.props.onBack=()=>closes++;popup.props.onFlowie=()=>prepares++;popup.props.onAcknowledge=()=>acknowledges++;
  let tree=popup.view(),actions=boundary.nodes(tree).filter(n=>n.type==='Pressable');
  actions[0].props.onPress();actions[1].props.onPress();tree.props.onRequestClose();assert.deepEqual([prepares,acknowledges,closes],[1,1,1]);
  popup.props.busy=true;tree=popup.view();tree.props.onRequestClose();assert.equal(closes,1);
  assert.ok(boundary.nodes(tree).filter(n=>n.type==='Pressable').every(n=>n.props.disabled&&appearance(n.props.style).minHeight>=48));
  popup.props.error='Retry saving';assert.ok(boundary.texts(popup.view()).includes('Retry saving'));
  assert.ok(!boundary.texts(popup.view()).some(text=>typeof text==='string'&&text.startsWith('Preview only')));popup.life.unmount();
  const production=createPopup({width:360,height:800,fontScale:1},{top:24,bottom:24,left:0,right:0},false);
  assert.ok(!boundary.texts(production.view()).some(text=>typeof text==='string'&&text.startsWith('Preview only')));production.life.unmount();
  const destination=service.notificationDestination(record(1).notification);assert.equal(destination.pathname,'/donation-preparation');assert.equal(destination.params.id,'1');
  await service.notificationApi.reminders('session');assert.equal(sent.path,'/notifications/reminders');
  await service.notificationApi.preparation('session',1);assert.equal(sent.path,'/notifications/1/preparation');assert.equal(sent.token,'session');
  await service.notificationApi.acknowledgePreparation('session',1);assert.equal(sent.path,'/notifications/1/preparation-acknowledgement');assert.equal(sent.method,'POST');assert.equal(sent.body,undefined);
  assert.match(service.preparationQuestion('Tomorrow drive','2026-11-01'),/November 1, 2026/);
  // Voluntary inbox entry revalidates even acknowledged guides and never uses
  // local dismissals/read state to authorize a guide or an acknowledgement.
  const manualHost=boundary.host(),manualRoutes=[],manualTimers=new Map();let manualId='9',manualAvailable=true,manualForeground,manualReads=0,manualAcks=0;
  const manualAuth={user:{id:80},preparationReminder:async id=>{manualReads++;assert.equal(id,9);if(!manualAvailable)throw new ApiError('Stale',409);return {reminder:record(9)};},
    acknowledgePreparation:async id=>{manualAcks++;assert.equal(id,9);if(!manualAvailable)throw new ApiError('Stale',409);return {acknowledged:true};}};
  const manualModule=boundary.load('src/app/donation-preparation.tsx',{
    ...boundary.shared,react:manualHost.react,'@/contexts/auth-context':{useAuth:()=>manualAuth},
    '@/services/api':{ApiError,errorMessage:error=>error.message},'@/components/load-state':{LoadError:'LoadError'},
    '@/components/donation-preparation-modal':{DonationPreparationModal:'PreparationModal'},
    'expo-router':{Stack:{Screen:'Screen'},useLocalSearchParams:()=>({id:manualId,preview:'1'}),useFocusEffect:manualHost.focus,
      useRouter:()=>({canGoBack:()=>true,back:()=>manualRoutes.push('back'),push:route=>manualRoutes.push(route)})},
    'react-native':{...boundary.native,AppState:{addEventListener:(_,callback)=>{manualForeground=callback;return {remove:()=>{manualForeground=null;}};}}},
  },{setTimeout:fn=>{const key=Symbol();manualTimers.set(key,fn);return key;},clearTimeout:key=>manualTimers.delete(key)});
  const manualView=()=>manualHost.render(manualModule.default);
  const manualModal=()=>boundary.nodes(manualView()).find(n=>n.type==='PreparationModal').props;
  manualView();await flush();assert.equal(manualModal().visible,true);assert.equal(manualAcks,0);
  manualModal().onBack();assert.deepEqual(manualRoutes,['back']);assert.equal(manualAcks,0);
  manualModal().onAcknowledge();await flush();assert.equal(manualAcks,1);assert.equal(manualRoutes.at(-1),'back');
  manualHost.blur();manualHost.refocus();manualView();await flush();assert.equal(manualModal().visible,true,'Acknowledgement never blocks voluntary reopening');
  manualModal().onFlowie();await flush();assert.equal(manualRoutes.at(-1).pathname,'/flowie');assert.equal(manualRoutes.at(-1).params.preparationKey,'9');
  const routesBeforeStale=manualRoutes.length;manualAvailable=false;manualModal().onFlowie();await flush();
  assert.equal(manualRoutes.length,routesBeforeStale);assert.equal(manualModal().visible,false);
  let retry=boundary.nodes(manualView()).find(n=>n.type==='LoadError');assert.ok(retry);manualAvailable=true;await retry.props.onRetry();assert.equal(manualModal().visible,true);
  manualForeground('background');assert.equal(manualModal().visible,false);manualForeground('active');await flush();assert.equal(manualModal().visible,true);
  for(const expire of manualTimers.values())expire();assert.equal(manualModal().visible,false);
  manualId='../9';manualView();await flush();assert.equal(manualModal().visible,false);assert.ok(boundary.nodes(manualView()).some(n=>n.type==='LoadError'));
  const readsBeforeInvalid=manualReads,acksBeforeInvalid=manualAcks,routesBeforeInvalid=manualRoutes.length;
  for(const id of [undefined,'preview','']) {
    manualId=id;manualView();await flush();assert.equal(manualModal().visible,false);
    manualModal().onFlowie();manualModal().onAcknowledge();await flush();
    assert.equal(manualReads,readsBeforeInvalid);assert.equal(manualAcks,acksBeforeInvalid);assert.equal(manualRoutes.length,routesBeforeInvalid);
  }
  assert.ok(manualReads>=3);manualHost.unmount();assert.equal(manualForeground,null);assert.equal(manualTimers.size,0);
}

async function phaseFSettingsChecks() {
  const constants={executionEnvironment:'bare',expoConfig:{android:{package:'com.lifeflow.capstone'}}};
  const platform={OS:'android'},device={isDevice:true},intents=[];
  let permission={granted:false,canAskAgain:true},channel={importance:3},fallback=0,failChannel=false,failIntent=false,failFallback=false,writes=0;
  const native={getPermissionsAsync:async()=>permission,getNotificationChannelAsync:async id=>{assert.equal(id,'important');return channel;},
    AndroidImportance:{NONE:0,DEFAULT:3},setNotificationChannelAsync:async()=>{writes++;}};
  const push=load('src/services/push-notifications.ts',{
    'expo-constants':{__esModule:true,default:constants},'expo-device':device,'expo-notifications':native,
    'react-native':{Platform:platform,Linking:{sendIntent:async(action,extras)=>{intents.push({action,extras});if(failIntent||(failChannel&&action.includes('CHANNEL')))throw Error('Unsupported');},
      openSettings:async()=>{fallback++;if(failFallback)throw Error('Unsupported');}}},
  });
  assert.equal((await push.phoneNotificationPermission()).granted,false);assert.equal((await push.phoneNotificationPermission()).canAskAgain,true);
  channel={importance:0};assert.equal((await push.phoneNotificationPermission()).channelBlocked,true);
  assert.equal(await push.openPhoneNotificationSettings(true),true);assert.equal(intents.at(-1).action,'android.settings.CHANNEL_NOTIFICATION_SETTINGS');
  assert.deepEqual(JSON.parse(JSON.stringify(intents.at(-1).extras)),[{key:'android.provider.extra.APP_PACKAGE',value:'com.lifeflow.capstone'},{key:'android.provider.extra.CHANNEL_ID',value:'important'}]);
  failChannel=true;await push.openPhoneNotificationSettings(true);assert.equal(intents.at(-1).action,'android.settings.APP_NOTIFICATION_SETTINGS');
  failChannel=false;channel=null;await push.openPhoneNotificationSettings(true);assert.equal(intents.at(-1).action,'android.settings.APP_NOTIFICATION_SETTINGS');
  failIntent=true;assert.equal(await push.openPhoneNotificationSettings(),true);assert.equal(fallback,1);
  failFallback=true;assert.equal(await push.openPhoneNotificationSettings(),false);assert.equal(writes,0,'System settings paths never rewrite channel preferences');
  for(const os of ['ios','web']){platform.OS=os;assert.equal(await push.phoneNotificationPermission(),null);assert.equal(await push.openPhoneNotificationSettings(true),false);}
  platform.OS='android';constants.executionEnvironment='storeClient';assert.equal(await push.phoneNotificationPermission(),null);assert.equal(await push.openPhoneNotificationSettings(),false);

  const {host}=require('./flowie-test-boundaries.cjs');const life=host();let foreground,enabled=0,permissionReads=0,opened=[],openWorks=true;
  permission={granted:false,canAskAgain:true,channelBlocked:false};
  const shared={enablePush:async()=>{enabled++;await Promise.resolve();permission={...permission,granted:true};},pushStatus:''};
  const screen=load('src/app/notification-settings.tsx',{
    react:life.react,'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{useFocusEffect:life.focus},
    '@expo/vector-icons/MaterialIcons':{default:'Icon'},'@/components/profile-settings-page':{ProfileSettingsPage:'SettingsPage'},
    '@/contexts/notification-context':{useNotifications:()=>shared},
    '@/services/push-notifications':{phoneNotificationPermission:async()=>{permissionReads++;return permission;},openPhoneNotificationSettings:async channel=>{opened.push(channel);return openWorks;}},
    'react-native':{View:'View',Text:'Text',Pressable:'Pressable',StyleSheet:{create:x=>x},AppState:{addEventListener:(_,fn)=>{foreground=fn;return {remove:()=>{foreground=null;}};}}},
  });
  const render=()=>life.render(()=>screen.default());
  const rows=()=>nodes(render()).filter(n=>n.type==='Pressable');
  render();await flush();assert.equal(rows().length,2);assert.deepEqual(rows().map(n=>n.props.accessibilityLabel),['Phone Notifications','Sound & Vibration']);
  assert.equal(render().props.fallback,'/notifications');assert.equal(render().props.title,'Notification Settings');
  assert.ok(!JSON.stringify(render()).includes('About Notifications'));assert.ok(!nodes(render()).some(n=>n.type==='Switch'||n.type==='Modal'));
  const phone=rows()[0];phone.props.onPress();phone.props.onPress();await flush();assert.equal(enabled,1);assert.equal(opened.length,0,'The initial grant uses the existing prompt without opening a second settings screen');
  assert.match(JSON.stringify(render()),/Android permission allowed/);assert.equal(rows()[0].props.disabled,false);
  rows()[0].props.onPress();await flush();assert.equal(enabled,2);assert.deepEqual(opened,[false],'Already allowed permission retains registration and reaches app controls');
  permission={granted:false,canAskAgain:false,channelBlocked:false};const before=permissionReads;foreground('active');await flush();assert.ok(permissionReads>before);assert.match(JSON.stringify(render()),/Android permission not allowed/);
  rows()[0].props.onPress();await flush();assert.equal(enabled,2,'Permanently denied permission is never re-prompted');assert.equal(opened.at(-1),false);
  rows()[1].props.onPress();await flush();assert.equal(enabled,2);assert.equal(opened.at(-1),true,'Sound & Vibration requests existing channel controls only');
  permission={granted:true,canAskAgain:true,channelBlocked:true};rows()[0].props.onPress();await flush();assert.equal(opened.at(-1),true);assert.match(JSON.stringify(render()),/channel is off/);
  openWorks=false;rows()[1].props.onPress();await flush();assert.match(JSON.stringify(render()),/settings could not be opened/);
  permission=null;const openCount=opened.length,enableCount=enabled;rows()[0].props.onPress();await flush();assert.equal(opened.length,openCount);assert.equal(enabled,enableCount);assert.match(JSON.stringify(render()),/Android device build/);
  life.blur();assert.equal(foreground,null);life.refocus();await flush();assert.equal(rows().length,2);life.unmount();assert.equal(foreground,null);
}

function timestampChecks() {
  const now=new Date(2026,9,25,12,30).getTime();
  for(const invalid of [undefined,null,'','invalid',42])assert.equal(service.notificationTimeLabel(invalid,now),'Date unavailable');
  assert.equal(service.notificationTimeLabel(new Date(now-30000).toISOString(),now),'Just now');
  assert.equal(service.notificationTimeLabel(new Date(now-60000).toISOString(),now),'1 minute ago');
  assert.equal(service.notificationTimeLabel(new Date(now-600000).toISOString(),now),'10 minutes ago');
  assert.equal(service.notificationTimeLabel(new Date(now-3600000).toISOString(),now),'1 hour ago');
  assert.equal(service.notificationTimeLabel(new Date(2026,9,24,15).toISOString(),now),'Yesterday');
  assert.equal(service.notificationTimeLabel(new Date(2026,9,22,15).toISOString(),now),'3 days ago');
  assert.equal(service.notificationTimeLabel(new Date(2025,0,1).toISOString(),now),'Jan 1, 2025');
  assert.equal(service.notificationTimeLabel(new Date(2026,10,1).toISOString(),now),'Nov 1, 2026');
}

(async()=>{
  await reminderChecks();console.log('PASS: reminder popup dismiss/navigation, session suppression, expiry, foreground and server revalidation');
  await serviceChecks();console.log('PASS: notification API payloads and safe navigation');
  await permissionChecks();console.log('PASS: passive denial, explicit permission, token refresh, Expo Go/web/iOS/device guards');
  await contextChecks();console.log('PASS: badge lifecycle/coalescing, opt-in registration, owned push taps and listener cleanup');
  await screenChecks();console.log('PASS: inbox pagination, confirmed reads/read-all, failure handling, duplicate lock, shared unread badge');
  timestampChecks();console.log('PASS: relative timestamps, calendar days, old/future/malformed dates');
  await phaseFSettingsChecks();console.log('PASS: exactly two settings rows, permission grant/denial/resume, native channel/app/fallback navigation, Expo Go and unsupported devices');
})().catch(error=>{console.error(error);process.exitCode=1;});

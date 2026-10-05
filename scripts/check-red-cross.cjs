/* Actual service/hook/screen handlers; native and React boundaries are mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={},globals={}){
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>{if(n.endsWith('.png')){assert.ok(fs.existsSync(require('node:path').resolve(require('node:path').dirname(path),n)));return n;}if(!(n in imports))throw Error('Unexpected import '+n);return imports[n];},...globals});return module.exports;
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const texts=v=>nodes(v).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children).join('\n');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&texts(n).includes(label));
const native={View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',ScrollView:'ScrollView',TextInput:'TextInput',StyleSheet:{create:x=>x},Alert:{alert:()=>{throw Error('Unexpected validation alert');}}};
const presentation=load('src/services/announcement-presentation.ts',{'./api':{API_BASE_URL:'http://device.test:8000/api'}},{URL});
const eligibility=load('src/services/eligibility.ts',{'./api':{ApiError:class extends Error{}}});
const shared={'@/services/announcement-presentation':presentation,'@/components/tab-skeleton':{TabSkeleton:'TabSkeleton'},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'}};
// Deterministic hook host preserves slots, effect dependencies and cleanup.
function host(){
 const slots=[];let cursor=0;const queued=[];
 const effect=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};queued.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}};
 const react={
 useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},
 useCallback:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={deps,fn};return slots[i].fn;},
 useEffect:effect};
 return {react,focus:fn=>effect(fn,[fn]),render:fn=>{cursor=0;const result=fn();while(queued.length)queued.shift()();return result;},unmount:()=>slots.forEach(s=>s?.cleanup?.())};
}

(async()=>{
 const requests=[];
 const donations=load('src/services/donations.ts',{'./api':{apiRequest:async(path,options)=>{requests.push({path,options});return {};}}});
 const now=Date.now();
 const admin={id:9,title:'Admin bloodletting',description:'Test event',location:'Test venue',event_date:'2026-09-14',status:'published',published_at:new Date(now-1000).toISOString(),expires_at:new Date(now+60000).toISOString()};
 const red={id:null,source_type:'red_cross_dagupan',title:'Philippine Red Cross - Dagupan City Chapter',description:'Facility determines final eligibility.',location:'Dagupan City Chapter',event_date:null,start_time:null,status:'available'};
 assert.deepEqual(Array.from(donations.boardItems([],now)),['red-cross']);
 assert.deepEqual(Array.from(donations.boardItems([admin],now),row=>typeof row==='string'?row:row.id),[9,'red-cross']);
 assert.deepEqual(Array.from(donations.boardItems([{...admin,expires_at:new Date(now-1).toISOString()}],now)),['red-cross']);
 await donations.donationApi.opportunity('private','red-cross-dagupan');
 await donations.donationApi.join('private','red-cross-dagupan');
 assert.equal(requests[0].path,'/donation-opportunities/red-cross-dagupan');
 assert.equal(requests[1].path,'/donation-opportunities/red-cross-dagupan/join');assert.equal(requests[1].options.method,'POST');
 assert.equal(requests[1].options.body,undefined);
 await donations.donationApi.opportunities('private');
 await donations.donationApi.opportunity('private','9');
 await donations.donationApi.join('private','9');
 assert.equal(requests[2].path,'/announcements');
 assert.equal(requests[3].path,'/announcements/9');
 assert.equal(requests[4].path,'/donation-opportunities/9/join');
 admin.image_url='http://api.test/storage/announcements/drive.png';
 const routes=[];let dialog;
 const router={push:route=>routes.push(route),back:()=>routes.push('back'),canGoBack:()=>true,replace:route=>routes.push(route)};
 const boundary={...native,useWindowDimensions:()=>({width:360}),Alert:{alert:(...args)=>{dialog=args;}}};
 async function home(posts, history=[]){
  const h=host(),timers=new Set(),auth={loadProfile:async()=>{},opportunities:async()=>({data:posts}),donationHistory:async()=>({data:history})};
  const module=load('src/app/(tabs)/index.tsx',{...shared,'@/components/home-donation-reminder':{HomeDonationReminder:'Reminder'},'@/constants/flowie-mascots':load('src/constants/flowie-mascots.ts'),'react-native':boundary,react:h.react,'expo-router':{useFocusEffect:h.focus,useRouter:()=>router},
   '@/contexts/auth-context':{useAuth:()=>auth},'@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},
   '@/components/notification-bell':{NotificationBell:'Bell'}},{setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
  const view=()=>h.render(module.default);view();await flush();return {view,auth,timers,close:()=>h.unmount()};
 }
 let h=await home([]);assert.ok(texts(h.view()).includes('PINNED'));
 button(h.view(),'View Donation Option').props.onPress();assert.equal(routes.pop().params.id,'red-cross-dagupan');h.close();
 h=await home([admin]);assert.ok(texts(h.view()).indexOf('Admin bloodletting')<texts(h.view()).indexOf('Donate Through the Philippine Red Cross'));
 assert.ok(nodes(h.view()).some(n=>n.type==='Image' && n.props.source?.uri===admin.image_url));
 button(h.view(),'View Announcement').props.onPress();assert.equal(routes.pop().params.id,'9');h.close();

 // Part 2: shared public media, calendar dates, featured limits, refresh and routes.
 assert.equal(presentation.announcementImageUrl('http://localhost/storage/announcements/a.png'), 'http://device.test:8000/storage/announcements/a.png');
 assert.equal(presentation.announcementImageUrl('http://127.0.0.1:8000/storage/announcements/a.png?x=1'), 'http://device.test:8000/storage/announcements/a.png?x=1');
 assert.equal(presentation.announcementImageUrl('http://[::1]:8000/storage/announcements/a.png'), 'http://device.test:8000/storage/announcements/a.png');
 assert.equal(presentation.announcementImageUrl('/storage/announcements/a.png'), 'http://device.test:8000/storage/announcements/a.png');
 assert.equal(presentation.announcementImageUrl('https://cdn.test/a.png?signature=abc'), 'https://cdn.test/a.png?signature=abc');
 for(const value of [null, '', 'file:///storage/private/a.png', 'javascript:alert(1)', '/storage/private/a.png', 'http://localhost/storage/proofs/a.png', 'http://user:pass@localhost/storage/announcements/a.png']) assert.equal(presentation.announcementImageUrl(value),null);
 assert.equal(presentation.formatDonationDate('2026-09-28'),'September 28, 2026');
 assert.equal(presentation.formatDonationDate('2024-02-29'),'February 29, 2024');
 assert.equal(presentation.formatDonationDate('2026-02-30'),'Date to be announced');
 assert.equal(presentation.formatDonationDate(null),'Date to be announced');
 assert.equal(presentation.formatJoinedDate('2026-09-27T16:30:00Z'),'September 28, 2026');
 const older={...admin,id:8,title:'Older announcement',published_at:new Date(now-2000).toISOString()};
 const latest={id:75,status:'completed',joined_at:'2026-09-28T00:00:00Z',opportunity:admin};
 h=await home([older,admin],[latest,{...latest,id:74,opportunity:older}]);
 let homeTree=h.view();
 assert.ok(!texts(homeTree).includes('Older announcement'));
 assert.equal(nodes(homeTree).filter(n=>n.type==='Pressable'&&texts(n)==='View Announcement').length,1);
 assert.equal(nodes(homeTree).find(n=>n.type==='Text'&&n.props.children===admin.description).props.numberOfLines,3);
 assert.ok(texts(homeTree).includes('September 14, 2026'));
 for(const [label,expected] of [['View all announcements','/announcements'],['View all activity','/(tabs)/activity']]) {
  nodes(homeTree).find(n=>n.props?.accessibilityLabel===label).props.onPress();assert.equal(routes.pop(),expected);
 }
 nodes(homeTree).find(n=>n.props?.accessibilityLabel==='View recent activity').props.onPress();assert.equal(routes.pop().params.id,'75');
 assert.ok(texts(homeTree).indexOf('Recent Activity')<texts(homeTree).indexOf('How to Use LifeFlow'));
 assert.ok(nodes(homeTree).some(n=>n.props?.pointerEvents==='none'));
 for(const [status,label] of Object.entries(donations.DONATION_STATUS)){
  h.auth.donationHistory=async()=>({data:[{...latest,status}]});h.view();await flush();assert.ok(texts(h.view()).includes(label));
 }
 const pendingHome=deferred();h.auth.opportunities=()=>pendingHome.promise;h.view();
 assert.ok(!nodes(h.view()).some(n=>n.type==='TabSkeleton'),'Background reload preserves Home content');
 pendingHome.reject(new Error('Offline'));await flush();assert.ok(texts(h.view()).includes('Admin bloodletting'));assert.ok(texts(h.view()).includes('Offline'));h.close();
 assert.equal(h.timers.size,0);

 // Announcements screen uses the same active filter and existing detail route.
 const listHost=host(),listTimers=new Set();let listResult=deferred();
 const listAuth={opportunities:()=>listResult.promise};
 const announcementList=load('src/app/announcements.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:listHost.react,
  'expo-router':{useFocusEffect:listHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>listAuth},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message}},
  {setInterval:fn=>{listTimers.add(fn);return fn;},clearInterval:fn=>listTimers.delete(fn)});
 const renderList=()=>listHost.render(announcementList.default);
 const getList=()=>nodes(renderList()).find(n=>n.type==='FlatList');
 assert.equal(getList().props.ListEmptyComponent.type,'TabSkeleton');
 listResult.resolve({data:[older,admin,{...admin,id:10,expires_at:new Date(now-1).toISOString()},{...admin,id:11,status:'draft'}]});await flush();
 let announcementProps=getList().props;assert.deepEqual(Array.from(announcementProps.data,row=>row.id),[9,8]);assert.equal(announcementProps.showsVerticalScrollIndicator,false);
 const card=announcementProps.renderItem({item:admin});assert.ok(texts(card).includes('September 14, 2026'));card.props.onPress();assert.equal(routes.pop().params.id,'9');
 listResult=deferred();announcementProps.onRefresh();assert.equal(getList().props.refreshing,true);assert.equal(getList().props.data.length,2);
 listResult.reject(new Error('Refresh unavailable'));await flush();assert.equal(getList().props.data.length,2);assert.ok(texts(getList().props.ListHeaderComponent).includes('Refresh unavailable'));
 listResult=deferred();button(getList().props.ListHeaderComponent,'Retry').props.onPress();listResult.resolve({data:[]});await flush();assert.ok(texts(getList().props.ListEmptyComponent).includes('No active announcements'));
 nodes(renderList()).find(n=>n.props?.accessibilityLabel==='Back').props.onPress();assert.equal(routes.pop(),'back');
 listHost.unmount();assert.equal(listTimers.size,0);
 const failedHost=host();const failedList=load('src/app/announcements.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:failedHost.react,
  'expo-router':{useFocusEffect:failedHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>({opportunities:async()=>{throw new Error('Unavailable');}})},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message}},{setInterval:()=>0,clearInterval:()=>{}});
 failedHost.render(failedList.default);await flush();const failedTree=failedHost.render(failedList.default);assert.ok(texts(nodes(failedTree).find(n=>n.type==='FlatList').props.ListHeaderComponent).includes('Unavailable'));failedHost.unmount();
 console.log('Part 2 checks passed: public image URLs, date-only formatting, latest-only Home, all activity statuses, cached refresh, list loading/error/retry/empty, timer cleanup and navigation.');

 const activityHost=host();
 const activityAuth={donationHistory:async()=>({data:[],total:0,current_page:1,last_page:1})};
 const activity=load('src/app/(tabs)/activity.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:activityHost.react,
  'expo-router':{useFocusEffect:activityHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>activityAuth},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},'@/components/notification-bell':{NotificationBell:'Bell'}});
 activityHost.render(activity.default);await flush();
 const list=nodes(activityHost.render(activity.default)).find(n=>n.type==='FlatList');
 assert.equal(list.props.showsVerticalScrollIndicator,false);
 let finishRefresh;activityAuth.donationHistory=()=>new Promise(resolve=>{finishRefresh=resolve;});
 activityHost.render(activity.default);
 const refreshingList=nodes(activityHost.render(activity.default)).find(n=>n.type==='FlatList');
 assert.equal(refreshingList.props.ListEmptyComponent.type,'Text','An already loaded empty tab must not return to a skeleton');
 finishRefresh({data:[],total:0,current_page:1,last_page:1});await flush();
 assert.ok(texts(list.props.ListHeaderComponent).includes('Needs Revision'));
 for(const [status,label] of Object.entries(donations.DONATION_STATUS)){
  const card=list.props.renderItem({item:{id:88,status,opportunity:{...admin,title:'A long bloodletting activity title that needs several lines'}}});
  const children=card.props.children;assert.equal(children[0].type,'Text');assert.equal(children[0].props.children,'A long bloodletting activity title that needs several lines');
  const footer=children.at(-1),[statusBlock,view]=footer.props.children;
  assert.ok(texts(statusBlock).includes(label));assert.ok(texts(statusBlock).includes(donations.DONATION_STATUS_DESCRIPTION[status]));
  assert.equal(statusBlock.props.style.flex,1);assert.equal(statusBlock.props.style.minWidth,0);assert.equal(view.props.style.flexShrink,0);
  assert.equal(view.type,'Pressable');view.props.onPress();assert.equal(routes.pop().params.id,'88');
 }
 activityHost.unmount();
 class ApiError extends Error { constructor(message,status=409,fields={},data){super(message);this.status=status;this.data=data;} }
 for(const source of ['red-cross-dagupan','9']){
  for(const scenario of ['pending','for_verification','needs_revision','none','expired','not_eligible','eligible','cancel','race_active','race_evaluation','race_not_eligible','offline','donation_cooldown','race_donation_cooldown','rejected','cancelled','donation_cooldown_expired']){
   const detailHost=host();let joins=0,checks=0,pending=deferred();dialog=undefined;routes.length=0;
   const auth={opportunity:async()=>({opportunity:source==='9'?admin:red}),
    donationHistory:async(page,status)=>({data:status===scenario?[{id:77,status}]:[]}),
    eligibilityState:async()=>{
     checks++;if(scenario==='offline')throw new Error('Offline');
     return {assessment:scenario==='none'?null:{result:scenario==='not_eligible'?'not_eligible':'eligible'},
      cooldown_active:scenario!=='expired',remaining_seconds:scenario==='expired'?0:30000,
      is_on_donation_cooldown:scenario==='donation_cooldown',next_eligible_donation_at:'2027-01-01T00:00:00+08:00'};
    },
    joinOpportunity:async()=>{joins++;return pending.promise;}};
   const detail=load('src/app/announcement/[id].tsx',{...shared,'@/components/confirmation-modal':{ConfirmationModal:'ConfirmationModal'},'@/services/eligibility':eligibility,'react-native':boundary,react:detailHost.react,
    'expo-router':{Stack:{Screen:'Screen'},useFocusEffect:detailHost.focus,useRouter:()=>router,useLocalSearchParams:()=>({id:source})},
    '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{ApiError,errorMessage:e=>e.message}});
   const view=()=>detailHost.render(detail.default);view();await flush();
   const restModal=()=>nodes(view()).find(n=>n.type==='ConfirmationModal');
   const confirmation=()=>restModal().props;
   assert.ok(texts(view()).includes('Final donation eligibility is determined by the facility.'));
   if(source==='9'){assert.ok(nodes(view()).some(n=>n.type==='Image' && n.props.source?.uri===admin.image_url));assert.ok(texts(view()).includes('September 14, 2026'));assert.equal(nodes(view()).find(n=>n.type==='Text'&&n.props.children===admin.description).props.numberOfLines,undefined);}
   const go=button(view(),'Go Donate');go.props.onPress();go.props.onPress();await flush();
   assert.equal(joins,0,'No creation before confirmation');
   if(['pending','for_verification','needs_revision'].includes(scenario)){
    assert.equal(checks,0,'Active activity has priority over assessment');
    assert.equal(confirmation().title,'You already have an active donation activity');
    assert.equal(confirmation().secondaryLabel,'Close');confirmation().onPrimary();assert.equal(routes.pop().params.id,'77');
   }else if(scenario==='donation_cooldown'){
    assert.equal(dialog,undefined);assert.equal(checks,1);assert.equal(restModal().props.visible,true);
    assert.equal(restModal().props.title,'Donation Rest Period');assert.match(restModal().props.message,/January 1, 2027/);
    assert.equal(restModal().props.secondaryLabel,'Close');restModal().props.onSecondary();assert.equal(restModal().props.visible,false);
    button(view(),'Go Donate').props.onPress();await flush();restModal().props.onPrimary();assert.equal(routes.pop(),'/(tabs)/status');
   }else if(['none','expired'].includes(scenario)){
    assert.equal(confirmation().title,'Complete Your Pre-Screening');
    assert.equal(confirmation().secondaryLabel,'Cancel');assert.equal(confirmation().primaryLabel,'Evaluate with Flowie');
    confirmation().onPrimary();assert.equal(routes.pop(),'/evaluation');
   }else if(scenario==='not_eligible'){
    assert.equal(confirmation().title,'Not Ready to Donate Right Now');
    assert.ok(confirmation().message.includes('8h 20m'));
    assert.equal(confirmation().secondaryLabel+','+confirmation().primaryLabel,'Close,View Status');
    confirmation().onPrimary();assert.equal(routes.pop(),'/(tabs)/status');
   }else if(scenario==='offline'){
    assert.equal(dialog,undefined);assert.ok(texts(view()).includes('Offline'));
   }else{
    assert.equal(checks,1);assert.equal(confirmation().title,'Confirm Donation');
    assert.equal(confirmation().message,source==='9'?admin.title:red.title);
    assert.equal(confirmation().secondaryLabel,'Cancel');
    assert.equal(confirmation().dismissOnBackdrop,true);
    const confirm=confirmation().onPrimary;
    if(scenario==='cancel'){
     confirmation().onSecondary();confirm();assert.equal(joins,0);assert.equal(confirmation().visible,false);
    }else{
     confirm();confirm();assert.equal(joins,1);
     if(scenario.startsWith('race_')){
      const reason=scenario==='race_active'?'active_participation_exists':scenario==='race_evaluation'?'evaluation_required':scenario==='race_donation_cooldown'?'donation_cooldown_active':'evaluation_not_eligible';
      pending.reject(new ApiError('Changed',409,{}, {reason,participation_id:88,remaining_seconds:300,next_eligible_donation_at:'2027-01-01T00:00:00+08:00'}));
      await flush();
      if(scenario==='race_donation_cooldown'){
       assert.equal(restModal().props.visible,true);assert.match(restModal().props.message,/January 1, 2027/);
      }else assert.equal(confirmation().title,scenario==='race_active'?'You already have an active donation activity':scenario==='race_evaluation'?'Complete Your Pre-Screening':'Not Ready to Donate Right Now');
      if(scenario==='race_active'){confirmation().onPrimary();assert.equal(routes.pop().params.id,'88');}
      assert.equal(routes.length,0);
     }else{
      pending.resolve({participation:{id:123,status:'pending'}});await flush();
      const result=routes.pop();assert.equal(result.pathname,'/activity/[id]');assert.equal(result.params.id,'123');
     }
    }
   }
   assert.equal(dialog,undefined,'Donation confirmations use the shared modal, never native alerts');
   detailHost.unmount();
  }
 }
 console.log('Red Cross / Go Donate checks passed: both sources, ordered validation, popup routes, expiry, cancel, duplicate taps, changed-server-state recovery, offline safety and shared Activity navigation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

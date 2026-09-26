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
const shared={'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'}};
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
 const routes=[];let dialog;
 const router={push:route=>routes.push(route),back:()=>routes.push('back'),canGoBack:()=>true,replace:route=>routes.push(route)};
 const boundary={...native,useWindowDimensions:()=>({width:360}),Alert:{alert:(...args)=>{dialog=args;}}};
 async function home(posts){
  const h=host(),timers=new Set(),auth={opportunities:async()=>({data:posts})};
  const module=load('src/app/(tabs)/index.tsx',{...shared,'@/components/home-donation-reminder':{HomeDonationReminder:'Reminder'},'@/constants/flowie-mascots':load('src/constants/flowie-mascots.ts'),'react-native':boundary,react:h.react,'expo-router':{useFocusEffect:h.focus,useRouter:()=>router},
   '@/contexts/auth-context':{useAuth:()=>auth},'@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},
   '@/components/notification-bell':{NotificationBell:'Bell'}},{setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
  const view=()=>h.render(module.default);view();await flush();return {view,close:()=>h.unmount()};
 }
 let h=await home([]);assert.ok(texts(h.view()).includes('PINNED'));
 button(h.view(),'View Donation Option').props.onPress();assert.equal(routes.pop().params.id,'red-cross-dagupan');h.close();
 h=await home([admin]);assert.ok(texts(h.view()).indexOf('Admin bloodletting')<texts(h.view()).indexOf('Donate Through the Philippine Red Cross'));
 button(h.view(),'View Announcement').props.onPress();assert.equal(routes.pop().params.id,'9');h.close();

 const activityHost=host();
 const activityAuth={donationHistory:async()=>({data:[],total:0,current_page:1,last_page:1})};
 const activity=load('src/app/(tabs)/activity.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:activityHost.react,
  'expo-router':{useFocusEffect:activityHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>activityAuth},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},'@/components/notification-bell':{NotificationBell:'Bell'}});
 activityHost.render(activity.default);await flush();
 const list=nodes(activityHost.render(activity.default)).find(n=>n.type==='FlatList');
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
  for(const scenario of ['pending','for_verification','needs_revision','none','expired','not_eligible','eligible','cancel','race_active','race_evaluation','race_not_eligible','offline']){
   const detailHost=host();let joins=0,checks=0,pending=deferred();dialog=undefined;routes.length=0;
   const auth={opportunity:async()=>({opportunity:source==='9'?admin:red}),
    donationHistory:async(page,status)=>({data:status===scenario?[{id:77,status}]:[]}),
    eligibilityState:async()=>{
     checks++;if(scenario==='offline')throw new Error('Offline');
     return {assessment:scenario==='none'?null:{result:scenario==='not_eligible'?'not_eligible':'eligible'},
      cooldown_active:scenario!=='expired',remaining_seconds:scenario==='expired'?0:30000};
    },
    joinOpportunity:async()=>{joins++;return pending.promise;}};
   const detail=load('src/app/announcement/[id].tsx',{...shared,'react-native':boundary,react:detailHost.react,
    'expo-router':{Stack:{Screen:'Screen'},useFocusEffect:detailHost.focus,useRouter:()=>router,useLocalSearchParams:()=>({id:source})},
    '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{ApiError,errorMessage:e=>e.message}});
   const view=()=>detailHost.render(detail.default);view();await flush();
   assert.ok(texts(view()).includes('Final donation eligibility is determined by the facility.'));
   const go=button(view(),'Go Donate');go.props.onPress();go.props.onPress();await flush();
   assert.equal(joins,0,'No creation before confirmation');
   if(['pending','for_verification','needs_revision'].includes(scenario)){
    assert.equal(checks,0,'Active activity has priority over assessment');
    assert.equal(dialog[0],'You already have an active donation activity');
    assert.equal(dialog[2][0].text,'Close');dialog[2][1].onPress();assert.equal(routes.pop().params.id,'77');
   }else if(['none','expired'].includes(scenario)){
    assert.equal(dialog[0],'Complete Your Pre-Screening');
    assert.equal(dialog[2][0].text,'Cancel');assert.equal(dialog[2][1].text,'Evaluate with Flowie');
    dialog[2][1].onPress();assert.equal(routes.pop(),'/evaluation');
   }else if(scenario==='not_eligible'){
    assert.equal(dialog[0],'Not Ready to Donate Right Now');
    assert.ok(dialog[1].includes('8h 20m'));
    assert.deepEqual(dialog[2].map(x=>x.text).join(','),'Close,View Status');
    dialog[2][1].onPress();assert.equal(routes.pop(),'/(tabs)/status');
   }else if(scenario==='offline'){
    assert.equal(dialog,undefined);assert.ok(texts(view()).includes('Offline'));
   }else{
    assert.equal(checks,1);assert.equal(dialog[0],'Confirm Donation');
    assert.equal(dialog[1],source==='9'?admin.title:red.title);
    assert.equal(dialog[2][0].text,'Cancel');
    const confirm=dialog[2][1];
    if(scenario==='cancel'){
     dialog[2][0].onPress();confirm.onPress();assert.equal(joins,0);
    }else{
     confirm.onPress();confirm.onPress();assert.equal(joins,1);
     if(scenario.startsWith('race_')){
      const reason=scenario==='race_active'?'active_participation_exists':scenario==='race_evaluation'?'evaluation_required':'evaluation_not_eligible';
      pending.reject(new ApiError('Changed',409,{}, {reason,participation_id:88,remaining_seconds:300}));
      await flush();
      assert.equal(dialog[0],scenario==='race_active'?'You already have an active donation activity':scenario==='race_evaluation'?'Complete Your Pre-Screening':'Not Ready to Donate Right Now');
      if(scenario==='race_active'){dialog[2][1].onPress();assert.equal(routes.pop().params.id,'88');}
      assert.equal(routes.length,0);
     }else{
      pending.resolve({participation:{id:123,status:'pending'}});await flush();
      const result=routes.pop();assert.equal(result.pathname,'/activity/[id]');assert.equal(result.params.id,'123');
     }
    }
   }
   detailHost.unmount();
  }
 }
 console.log('Red Cross / Go Donate checks passed: both sources, ordered validation, popup routes, expiry, cancel, duplicate taps, changed-server-state recovery, offline safety and shared Activity navigation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

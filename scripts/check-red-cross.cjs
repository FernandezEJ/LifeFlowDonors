/* Actual service/hook/screen handlers; native and React boundaries are mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={},globals={}){
 if(!imports['@/components/load-state'] && path!=='src/components/load-state.tsx' && imports['react/jsx-runtime'] && imports['@expo/vector-icons/MaterialIcons'] && imports.react)imports={...imports,'@/components/load-state':load('src/components/load-state.tsx',imports,globals)};
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>{if (n === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}}); if(n.endsWith('.png')){assert.ok(fs.existsSync(require('node:path').resolve(require('node:path').dirname(path),n)));return n;}if(!(n in imports))throw Error('Unexpected import '+n);return imports[n];},...globals});return module.exports;
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const jsx=(type,props,key)=>typeof type==='function'?type(props):({type,key,props});
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const texts=v=>nodes(v).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children).join('\n');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&(texts(n).includes(label)||n.props.accessibilityLabel===label));
const native={View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',ScrollView:'ScrollView',TextInput:'TextInput',StyleSheet:{create:x=>x},Alert:{alert:()=>{throw Error('Unexpected validation alert');}}};
const presentation=load('src/services/announcement-presentation.ts',{'./api':{API_BASE_URL:'http://device.test:8000/api'}},{URL});
const eligibility=load('src/services/eligibility.ts',{'./api':{ApiError:class extends Error{}}});
const shared={'@/services/announcement-presentation':presentation,'@/components/tab-skeleton':{TabSkeleton:'TabSkeleton'},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'}};
shared['@/components/announcement-image']={AnnouncementImage:props=>({type:'AnnouncementImage',props:{...props,children:props.uri?null:{type:'Text',props:{children:'No event image available'}}}})};
const body=load('src/components/announcement-body.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native});
shared['@/components/announcement-body']=body;
shared['@/components/did-you-know']={DidYouKnow:'DidYouKnow'};
const richDoc={version:1,blocks:[{type:'paragraph',content:[{text:'Hello',bold:true,italic:true}]},
 {type:'bullet_list',items:[[{text:'Bring ID'}]]},{type:'ordered_list',items:[[{text:'Register'}],[{text:'Donate'}]]}]};
assert.equal(body.isAnnouncementDocument(richDoc),true);
const richTree=body.AnnouncementBody({description:'Plain preview',document:richDoc});
assert.ok(texts(richTree).includes('Bring ID')&&texts(richTree).includes('1.')&&texts(richTree).includes('2.')&&texts(richTree).includes('•'));
const marked=nodes(richTree).find(n=>n.type==='Text'&&n.props.children==='Hello');
assert.equal(marked.props.style[0].fontWeight,'700');assert.equal(marked.props.style[1].fontStyle,'italic');
for(const document of [null,{version:2,blocks:[]},{version:1,blocks:[{type:'iframe',content:[]}]},
 {version:1,blocks:[{type:'paragraph',content:[{text:'Unsafe',href:'javascript:alert(1)'}]}]}]){
 const legacy='<b>literal old text</b>\nSecond line **unchanged**';
 assert.equal(body.AnnouncementBody({description:legacy,document}).props.children,legacy);
}
// Deterministic hook host preserves slots, effect dependencies and cleanup.
function host(){
 const slots=[];let cursor=0;const queued=[],focusSlots=new Set();
 const effect=(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};queued.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}};
 const react={
 useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},
 useCallback:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={deps,fn};return slots[i].fn;},
 useMemo:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={deps,value:fn()};return slots[i].value;},
 memo:fn=>fn,useEffect:effect};
 return {react,focus:fn=>{focusSlots.add(cursor);effect(fn,[fn]);},render:fn=>{cursor=0;const result=fn();while(queued.length)queued.shift()();return result;},
  blur:()=>focusSlots.forEach(i=>{slots[i].cleanup?.();slots[i].cleanup=undefined;slots[i].deps=[];}),unmount:()=>slots.forEach(s=>s?.cleanup?.())};
}

(async()=>{
 const requests=[];
 const donations=load('src/services/donations.ts',{'./api':{apiRequest:async(path,options)=>{requests.push({path,options});return {};}}});
 const now=Date.now();
 const admin={id:9,title:'Admin bloodletting',description:'Test event',location:'Test venue',event_date:'2026-09-14',status:'published',published_at:new Date(now-1000).toISOString(),expires_at:new Date(now+60000).toISOString()};
 const red={id:null,source_type:'red_cross_dagupan',title:'Saved Philippine Red Cross chapter title',summary:'Saved short description',description:'Facility determines final eligibility.',image_url:'https://cdn.test/chapter.png',location:'Dagupan City Chapter',event_date:null,start_time:null,status:'available'};
 assert.deepEqual(Array.from(donations.boardItems([],now)),[], 'Missing server content never fabricates a permanent card');
 assert.deepEqual(Array.from(donations.boardItems([],now,red),row=>row.source_type),['red_cross_dagupan']);
 assert.deepEqual(Array.from(donations.boardItems([admin],now,red),row=>row.id),[9,null]);
 assert.deepEqual(Array.from(donations.boardItems([{...admin,expires_at:new Date(now-1).toISOString()}],now,red),row=>row.id),[null]);
 const many=[{...admin,id:8,published_at:new Date(now-2000).toISOString()},admin,{...admin,id:7,status:'draft'},red];
 assert.deepEqual(Array.from(donations.boardItems(many,now,red),row=>row.id),[9,8,null]);
 assert.deepEqual(Array.from(donations.boardItems(many,now,red,true),row=>row.id),[9,null]);
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
 async function home(posts, history=[], options={}){
  const h=host(),timers=new Map(),clock={now:options.now??Date.now()};let foreground;
  const auth={profile:null,loadProfile:async()=>{},opportunities:async()=>({data:posts,permanent_post:red}),donationHistory:async()=>({data:history}),...options.auth};
  const addTimer=(kind,fn,delay)=>{const key={};timers.set(key,{kind,fn,delay});return key;};
  const module=load('src/app/(tabs)/index.tsx',{...shared,'@/components/home-donation-reminder':{HomeDonationReminder:'Reminder'},'@/constants/flowie-mascots':load('src/constants/flowie-mascots.ts'),react:h.react,'expo-router':{useFocusEffect:h.focus,useRouter:()=>router},
   '@/contexts/auth-context':{useAuth:()=>auth},'@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},
   '@/components/notification-bell':{NotificationBell:'Bell'},
   'react-native':{...boundary,useWindowDimensions:()=>({width:options.width??360,fontScale:options.fontScale??1}),AppState:{addEventListener:(_,fn)=>{foreground=fn;return {remove(){foreground=null;}};}}}},
   {Date:class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}},
    setInterval:(fn,delay)=>addTimer('interval',fn,delay),clearInterval:key=>timers.delete(key),
    setTimeout:(fn,delay)=>addTimer('timeout',fn,delay),clearTimeout:key=>timers.delete(key)});
  const view=()=>h.render(module.default);const initial=view();await flush();return {view,initial,auth,timers,clock,foreground:()=>foreground?.('active'),
    fire:key=>{const timer=timers.get(key);if(timer?.kind==='timeout')timers.delete(key);timer?.fn();},blur:()=>h.blur(),close:()=>h.unmount()};
 }
 let h=await home([]);assert.ok(texts(h.view()).includes('PERMANENT'));assert.ok(!texts(h.view()).includes('PINNED'));
 const permanentCard=button(h.view(),'View details: '+red.title);permanentCard.props.onPress();assert.equal(routes.pop().params.id,'red-cross-dagupan');
 assert.equal(nodes(permanentCard).filter(n=>n.type==='Pressable').length,1);assert.equal(button(h.view(),'View Donation Option'),undefined);
 assert.ok(nodes(permanentCard).some(n=>n.type==='Icon'&&n.props.name==='chevron-right'));
 assert.ok(nodes(permanentCard).some(n=>n.type==='AnnouncementImage'&&n.props.compact&&n.props.preview));assert.match(texts(permanentCard),/Saved short description/);h.close();
 h=await home([admin]);assert.ok(texts(h.view()).indexOf('Admin bloodletting')<texts(h.view()).indexOf(red.title));
 assert.ok(nodes(h.view()).some(n=>n.type==='AnnouncementImage' && n.props.uri===admin.image_url));
 button(h.view(),'View Details').props.onPress();assert.equal(routes.pop().params.id,'9');h.close();

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
 assert.equal(nodes(homeTree).filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('View details:')).length,2);
 assert.equal(nodes(homeTree).find(n=>n.type==='Text'&&n.props.children===admin.description).props.numberOfLines,2);
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
 pendingHome.reject(new Error('Offline'));await flush();assert.ok(texts(h.view()).includes('Admin bloodletting'));assert.ok(texts(h.view()).includes('Connection Problem'));h.close();
 assert.equal(h.timers.size,0);

 // Phase A: local greeting boundaries, focus/foreground changes and no per-second clock.
 for(const [hour,minute,greeting] of [[4,59,'Good evening'],[5,0,'Good morning'],[11,59,'Good morning'],[12,0,'Good afternoon'],[17,59,'Good afternoon'],[18,0,'Good evening']]){
  h=await home([],[],{now:new Date(2026,9,24,hour,minute).getTime(),auth:{profile:{first_name:' Harry '}}});
  assert.ok(texts(h.view()).includes(greeting+', Harry'));
  assert.ok(!Array.from(h.timers.values()).some(t=>t.kind==='interval'&&t.delay===1000));
  const [key,timer]=Array.from(h.timers.entries()).find(([,t])=>t.kind==='timeout');
  h.clock.now+=timer.delay;h.fire(key);
  assert.ok(texts(h.view()).includes((hour<5||hour>=18?'Good morning':hour<12?'Good afternoon':'Good evening')+', Harry'));
  h.clock.now=new Date(2026,9,24,18,1).getTime();h.foreground();await flush();assert.ok(texts(h.view()).includes('Good evening, Harry'));
  h.blur();h.clock.now=new Date(2026,9,25,5,1).getTime();h.view();await flush();assert.ok(texts(h.view()).includes('Good morning, Harry'));h.close();
 }
 for(const name of [null,undefined,'','   ']){
  h=await home([],[],{auth:{profile:{first_name:name}}});const greeting=nodes(h.view()).find(n=>n.type==='Text'&&texts(n).startsWith('Good '));
  assert.ok(greeting);assert.doesNotMatch(texts(greeting),/,|undefined|null/);h.close();
 }
 const profileWait=deferred();h=await home([admin],[latest],{auth:{loadProfile:()=>profileWait.promise}});
 assert.ok(/Good (morning|afternoon|evening)/.test(texts(h.view())),'The local greeting remains available while profile data loads');
 assert.ok(texts(h.view()).includes(admin.title)&&button(h.view(),'View recent activity'),'Slow profile cannot block loaded sections');
 h.auth.profile={first_name:'Harry'};profileWait.resolve();await flush();assert.match(texts(h.view()),/Good (morning|afternoon|evening), Harry/);h.close();
 const boardWait=deferred();let boardRequests=0;
 h=await home([], [latest], {auth:{profile:{first_name:'Harry'},opportunities:()=>{boardRequests++;return boardWait.promise;}}});
 assert.ok(texts(h.view()).includes('Harry'));assert.ok(button(h.view(),'View recent activity'));
 assert.ok(nodes(h.view()).some(n=>n.type==='TabSkeleton'&&n.props.label==='Loading announcements'));
 button(h.view(),'Ask Flowie').props.onPress();assert.equal(routes.pop(),'/flowie');
 const refreshKey=Array.from(h.timers.entries()).find(([,t])=>t.kind==='interval'&&t.delay===30000)[0];
 h.fire(refreshKey);h.fire(refreshKey);await flush();assert.equal(boardRequests,1,'Pending sections coalesce periodic refreshes');
 h.blur();h.view();await flush();assert.equal(boardRequests,1,'Quick refocus reuses the same in-flight request');
 boardWait.resolve({data:[admin]});await flush();assert.ok(button(h.view(),'View Details'));h.close();
 let offline=true,boardCount=0,activityCount=0,profileCount=0;
 h=await home([],[],{auth:{loadProfile:async()=>{profileCount++;if(offline)throw new Error('Profile offline');},
  opportunities:async()=>{boardCount++;if(offline)throw new Error('Board offline');return {data:[admin]};},
  donationHistory:async()=>{activityCount++;if(offline)throw new Error('Activity offline');return {data:[latest]};}}});
 assert.ok(button(h.view(),'Retry profile')&&button(h.view(),'Retry announcements')&&button(h.view(),'Retry activity'));
 assert.equal(button(h.view(),'View details: '+red.title),undefined,'Offline initial load must not show hardcoded permanent information');assert.ok(!nodes(h.view()).some(n=>n.type==='TabSkeleton'));
 offline=false;button(h.view(),'Retry announcements').props.onPress();await flush();
 assert.equal(boardCount,2);assert.equal(activityCount,1);assert.equal(profileCount,1);assert.ok(button(h.view(),'View Details'));
 button(h.view(),'Retry activity').props.onPress();await flush();assert.ok(button(h.view(),'View recent activity'));
 button(h.view(),'Retry profile').props.onPress();await flush();assert.ok(!texts(h.view()).includes('Profile offline'));h.close();
 for(const [width,fontScale] of [[320,1],[320,2],[768,2]]){
  h=await home([admin],[],{width,fontScale});const tree=h.view();
  const ask=button(tree,'Ask Flowie'),style=Object.assign({},...ask.props.style({pressed:false}).filter(Boolean));
  assert.equal(style.flexDirection,'row');assert.ok(style.minHeight>=44);
  assert.ok(nodes(ask).some(n=>n.type==='Icon'&&n.props.name==='chevron-right'&&n.props.size===22));
  assert.ok(nodes(tree).some(n=>n.type==='Image'&&n.props.accessibilityLabel==='Flowie, the LifeFlow assistant'));
  const card=nodes(tree).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='View details: '+admin.title);
  assert.ok(card.props.style({pressed:true}).some(s=>s?.opacity<1));assert.equal(nodes(card).filter(n=>n.type==='Pressable').length,1);
  assert.equal(nodes(card).find(n=>n.type==='AnnouncementImage').props.preview,true);h.close();
 }
 // Real shared image component: fixed covers, full details, stable sources and fresh-image/error recovery.
 const imageHost=host(),imageModule=load('src/components/announcement-image.tsx',{...shared,react:imageHost.react},{URL});
 let imageProps={uri:'https://cdn.test/portrait.png',title:'Portrait',preview:true};
 const renderImage=()=>imageHost.render(()=>imageModule.AnnouncementImage(imageProps));
 renderImage().props.onLayout({nativeEvent:{layout:{width:320}}});
 nodes(renderImage()).find(n=>n.type==='Image').props.onLoad({nativeEvent:{source:{width:400,height:1200}}});
 assert.equal(renderImage().props.style[1].aspectRatio,16/9);assert.equal(nodes(renderImage()).find(n=>n.type==='Image').props.resizeMode,'cover');
 imageProps={...imageProps,compact:true};assert.equal(renderImage().props.style[1].aspectRatio,32/9,'Permanent cover is half the height at the same width');
 assert.equal(nodes(renderImage()).find(n=>n.type==='Image').props.resizeMode,'cover');imageProps={...imageProps,compact:false};
 assert.equal(nodes(renderImage()).find(n=>n.type==='Image').props.fadeDuration,0);
 const originalSource=nodes(renderImage()).find(n=>n.type==='Image').props.source;
 imageProps={...imageProps};assert.equal(nodes(renderImage()).find(n=>n.type==='Image').props.source,originalSource,'Unchanged rerenders retain the native source');
 imageProps={...imageProps,preview:false};assert.equal(renderImage().props.style[1].height,960,'Detail preserves full portrait aspect ratio');
 assert.equal(nodes(renderImage()).find(n=>n.type==='Image').props.resizeMode,'contain');
 const previousLoad=nodes(renderImage()).find(n=>n.type==='Image').props.onLoad;
 imageProps={uri:'https://cdn.test/banner.png',title:'Banner',preview:false};previousLoad({nativeEvent:{source:{width:400,height:1200}}});
 assert.equal(renderImage().props.style[1].height,180,'Late image metadata cannot resize the new URL');
 nodes(renderImage()).find(n=>n.type==='Image').props.onLoad({nativeEvent:{source:{width:1200,height:400}}});
 assert.equal(renderImage().props.style[1].height,320/3);
 nodes(renderImage()).find(n=>n.type==='Image').props.onError();assert.ok(texts(renderImage()).includes('No event image available'));
 imageProps={uri:null,title:'Missing'};assert.ok(texts(renderImage()).includes('No event image available'));imageHost.unmount();
 const signed=(file,stamp,extra='')=>`https://media.test/announcements/${file}.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=${stamp}&X-Amz-Expires=900&X-Amz-Credential=test&X-Amz-SignedHeaders=host&X-Amz-Signature=${stamp}&X-Amz-Security-Token=${stamp}${extra}`;
 const coverHost=host(),coverModule=load('src/components/announcement-image.tsx',{...shared,react:coverHost.react},{URL});
 let coverProps={uri:signed('one','first'),title:'First title',preview:true};
 const cover=()=>coverHost.render(()=>coverModule.AnnouncementImage(coverProps));
 const nativeImage=()=>nodes(cover()).find(n=>n.type==='Image');
 const loadedImage=nativeImage();loadedImage.props.onLoad({nativeEvent:{source:{width:400,height:1200}}});
 for(const stamp of ['second','third','fourth']){
  coverProps={...coverProps,uri:signed('one',stamp),title:'Updated title'};
  assert.equal(nativeImage().props.source,loadedImage.props.source,'Re-signing an already-loaded object must not reload the native image');
  assert.equal(nativeImage().key,undefined,'Signed URLs must not key/remount the image');
  assert.equal(nativeImage().props.accessibilityLabel,'Updated title event banner');
 }
 // If the retained source ever fails, retry the newest signed URL, not the expired one.
 nativeImage().props.onError();assert.equal(nativeImage().props.source.uri,coverProps.uri);
 const oldError=nativeImage().props.onError;
 coverProps={...coverProps,uri:signed('two','new-upload')};assert.equal(nativeImage().props.source.uri,coverProps.uri,'A real image replacement updates immediately');
 oldError();assert.ok(nativeImage(),'An old error cannot hide a new upload');
 nativeImage().props.onLoad({nativeEvent:{source:{width:1200,height:400}}});
 assert.equal(cover().props.style[1].aspectRatio,16/9,'Portrait and landscape covers use the same layout');
 coverProps={...coverProps,uri:signed('two','version','&versionId=new')};assert.equal(nativeImage().props.source.uri,coverProps.uri,'Non-signing query/version changes remain meaningful');
 nativeImage().props.onError();assert.ok(texts(cover()).includes('No event image available'));
 coverProps={...coverProps,uri:signed('two','retry','&versionId=new')};assert.equal(nativeImage().props.source.uri,coverProps.uri,'Failed images accept refreshed URLs');
 nativeImage().props.onLoad({nativeEvent:{source:{width:1200,height:400}}});
 coverProps={...coverProps,uri:'https://cdn.test/legacy.png?v=1'};nativeImage().props.onLoad({nativeEvent:{source:{width:1200,height:400}}});
 coverProps={...coverProps,uri:'https://cdn.test/legacy.png?v=2'};assert.equal(nativeImage().props.source.uri,coverProps.uri,'Legacy cache-busting queries are preserved');
 coverProps={...coverProps,uri:null};assert.ok(texts(cover()).includes('No event image available'));assert.equal(cover().props.style[1].aspectRatio,16/9);coverHost.unmount();
 let savedPermanent=red;
 h=await home([older,admin],[],{auth:{opportunities:async()=>({data:[older,admin],permanent_post:savedPermanent})}});
 const permanentPoll=Array.from(h.timers.entries()).find(([,timer])=>timer.kind==='interval'&&timer.delay===30000)[0];
 savedPermanent={...red,title:'Admin edited permanent title',summary:'Admin edited preview',image_url:'https://cdn.test/new-permanent.png'};
 h.fire(permanentPoll);await flush();assert.match(texts(h.view()),/Admin edited permanent title/);assert.doesNotMatch(texts(h.view()),/Saved Philippine Red Cross chapter title/);
 const updatedCard=button(h.view(),'View details: '+savedPermanent.title);
 assert.match(texts(updatedCard),/Admin edited preview/);assert.equal(nodes(updatedCard).find(n=>n.type==='AnnouncementImage').props.uri,savedPermanent.image_url);
 assert.ok(!texts(h.view()).includes(older.title),'Only the newest regular preview remains beside the permanent card');h.close();
 // Home still applies real title/image updates and retains valid cards during silent polling.
 let refreshedPost=admin;h=await home([admin],[],{auth:{opportunities:async()=>({data:[{...refreshedPost}]})}});
 const poll=Array.from(h.timers.entries()).find(([,t])=>t.kind==='interval'&&t.delay===30000)[0];
 const before=nodes(h.view()).find(n=>n.type==='AnnouncementImage');h.fire(poll);await flush();
 assert.equal(nodes(h.view()).find(n=>n.type==='AnnouncementImage').props.uri,before.props.uri);
 assert.ok(!nodes(h.view()).some(n=>n.type==='TabSkeleton'));
 refreshedPost={...admin,title:'Changed event',image_url:'https://cdn.test/updated.png'};h.fire(poll);await flush();
 assert.ok(texts(h.view()).includes('Changed event'));assert.equal(nodes(h.view()).find(n=>n.type==='AnnouncementImage').props.uri,refreshedPost.image_url);
 button(h.view(),'View Details').props.onPress();assert.equal(routes.pop().params.id,'9');h.close();
 console.log('Dashboard revision checks passed: uniform 16:9 covers, no Android fade, stable native source through repeated signing/refresh, real image/version updates, stale-event protection and error recovery; full detail images preserved.');
 console.log('Phase A Dashboard checks passed: local greeting/focus/boundaries, independent loading/retry, cached refresh, request coalescing, 320dp/large-font styles, whole-card routes, unpinned labels and full-aspect image fallback.');

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
 listResult.resolve({data:[older,admin,{...admin,id:10,expires_at:new Date(now-1).toISOString()},{...admin,id:11,status:'draft'},red],permanent_post:red});await flush();
 let announcementProps=getList().props;assert.deepEqual(Array.from(announcementProps.data,row=>row.id),[9,8,null]);assert.equal(announcementProps.showsVerticalScrollIndicator,false);
 const permanentListCard=announcementProps.renderItem({item:red});assert.ok(texts(permanentListCard).includes('Permanent'));assert.ok(!texts(permanentListCard).includes('Date to be announced'));
 assert.equal(announcementProps.keyExtractor(red),'red-cross');permanentListCard.props.onPress();assert.equal(routes.pop().params.id,'red-cross-dagupan');
 const card=announcementProps.renderItem({item:admin});assert.ok(texts(card).includes('September 14, 2026'));card.props.onPress();assert.equal(routes.pop().params.id,'9');
 listResult=deferred();announcementProps.onRefresh();assert.equal(getList().props.refreshing,true);assert.equal(getList().props.data.length,3);
 listResult.reject(new Error('Refresh unavailable'));await flush();assert.equal(getList().props.data.length,3);assert.ok(texts(getList().props.ListHeaderComponent).includes('Refresh unavailable'));
 listResult=deferred();button(getList().props.ListHeaderComponent,'Retry').props.onPress();listResult.resolve({data:[],permanent_post:red});await flush();assert.deepEqual(Array.from(getList().props.data,row=>row.id),[null]);
 listResult=deferred();getList().props.onRefresh();
 listResult.resolve({data:[]});await flush();assert.ok(texts(getList().props.ListEmptyComponent).includes('No active announcements'));
 nodes(renderList()).find(n=>n.props?.accessibilityLabel==='Back').props.onPress();assert.equal(routes.pop(),'back');
 listHost.unmount();assert.equal(listTimers.size,0);
 const failedHost=host();const failedList=load('src/app/announcements.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:failedHost.react,
  'expo-router':{useFocusEffect:failedHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>({opportunities:async()=>{throw new Error('Unavailable');}})},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message}},{setInterval:()=>0,clearInterval:()=>{}});
 failedHost.render(failedList.default);await flush();const failedTree=failedHost.render(failedList.default);assert.ok(texts(nodes(failedTree).find(n=>n.type==='FlatList').props.ListHeaderComponent).includes('Unavailable'));failedHost.unmount();
 console.log('Part 2 checks passed: public image URLs, date-only formatting, latest-only Home, all activity statuses, cached refresh, list loading/error/retry/empty, timer cleanup and navigation.');

 const activityHost=host(),historyCalls=[];
 const emptyHistory={data:[],total:0,current_page:1,last_page:1};
 let historyResult=async()=>emptyHistory;
 const activityAuth={donationHistory:(page,status)=>{historyCalls.push({page,status});return historyResult(page,status);}};
 const activity=load('src/app/(tabs)/activity.tsx',{...shared,'react-native':{...native,FlatList:'FlatList'},react:activityHost.react,
  'expo-router':{useFocusEffect:activityHost.focus,useRouter:()=>router},'@/contexts/auth-context':{useAuth:()=>activityAuth},
  '@/services/donations':donations,'@/services/api':{errorMessage:e=>e.message},'@/components/notification-bell':{NotificationBell:'Bell'}});
 const activityView=()=>activityHost.render(activity.default);
 const activityList=()=>nodes(activityView()).find(n=>n.type==='FlatList');
 const filters=()=>nodes(activityList().props.ListHeaderComponent).filter(n=>n.type==='Pressable'&&texts(n)!==''&&!texts(n).includes('Tap to retry.'));
 const chooseFilter=async label=>{filters().find(n=>texts(n)===label).props.onPress();activityView();await flush();};
 assert.equal(activityList().props.ListEmptyComponent.type,'TabSkeleton');await flush();
 const list=activityList();
 assert.equal(list.props.showsVerticalScrollIndicator,false);
 assert.ok(!texts(list.props.ListHeaderComponent).includes('Your donation activities'));
 assert.ok(nodes(activityView()).some(n=>n.type==='Bell'));
 assert.deepEqual(filters().map(texts),['All','Pending','For Verification','Needs Revision','Completed','Rejected','Cancelled']);
 let scrollResets=0;list.props.ref.current={scrollToOffset:options=>{assert.equal(options.offset,0);assert.equal(options.animated,false);scrollResets++;}};
 const refreshHistory=async()=>{activityHost.blur();activityView();await flush();};
 const refreshWait=deferred();historyResult=()=>refreshWait.promise;await refreshHistory();
 const refreshingList=activityList();
 assert.notEqual(refreshingList.props.ListEmptyComponent?.type,'TabSkeleton','An already loaded empty tab must not return to a skeleton');
 refreshWait.resolve(emptyHistory);await flush();historyResult=async()=>emptyHistory;
 assert.ok(scrollResets>0);
 const statusPalette=load('src/constants/theme.ts',{'react-native':{Platform:{select:options=>options.default}}}).DonationStatusColors;
 for(const [status,label] of Object.entries(donations.DONATION_STATUS)){
  const title='A long bloodletting activity title that needs several lines';
  const record={id:88,status,opportunity:{...admin,title,event_date:status==='pending'?null:admin.event_date}};
  const card=activityList().props.renderItem({item:record});
  assert.equal(card.type,'Pressable');assert.equal(card.props.accessibilityRole,'button');assert.equal(card.props.accessibilityLabel,`View activity: ${title}. ${label}`);
  assert.equal(nodes(card).filter(n=>n.type==='Pressable').length,1,'No nested View button or chevron tap target');
  assert.ok(!nodes(card).some(n=>n.type==='Text'&&n.props.children==='View'));
  assert.ok(card.props.style({pressed:true}).some(style=>style?.opacity<1));
  const [heading,,footer]=card.props.children,[headingText,chevron]=heading.props.children;
  assert.equal(headingText.props.children,title);assert.equal(headingText.props.numberOfLines,undefined);
  assert.equal(headingText.props.style[1].flex,1);assert.equal(headingText.props.style[1].minWidth,0);
  assert.equal(chevron.type,'Icon');assert.equal(chevron.props.name,'chevron-right');assert.equal(chevron.props.accessible,false);assert.equal(chevron.props.style.flexShrink,0);
  assert.ok(texts(card).includes(record.opportunity.event_date||'Confirm arrangements with the chapter'));assert.ok(texts(card).includes(admin.location));
  const statusBlock=footer.props.children;
  assert.ok(texts(statusBlock).includes(label));assert.ok(texts(statusBlock).includes(donations.DONATION_STATUS_DESCRIPTION[status]));
  const badge=statusBlock.props.children[0];assert.equal(badge.props.style[1].backgroundColor,statusPalette[status].surface);
  assert.equal(badge.props.children.props.style[1].color,statusPalette[status].text);assert.equal(badge.props.style[0].maxWidth,'100%');
  assert.equal(statusBlock.props.style.flex,1);assert.equal(statusBlock.props.style.minWidth,0);
  const routesBefore=routes.length;card.props.onPress();card.props.onPress();assert.equal(routes.length,routesBefore+1,'Rapid taps push one detail screen');
  const destination=routes.pop();assert.equal(destination.pathname,'/activity/[id]');assert.equal(destination.params.id,'88','Participation ID differs from opportunity ID');
  assert.equal(activityList().props.keyExtractor(record),'88');await refreshHistory();
 }
 for(const [status,label] of Object.entries(donations.DONATION_STATUS)){
  await chooseFilter(label);assert.deepEqual(historyCalls.at(-1),{page:1,status});
  const selected=filters().find(n=>texts(n)===label);assert.ok(selected.props.style[1]);
 }
 await chooseFilter('All');assert.deepEqual(historyCalls.at(-1),{page:1,status:undefined});
 const participation={id:88,status:'pending',opportunity:admin},second={...participation,id:89},third={...participation,id:90};
 let nextPage=deferred();historyResult=async page=>page===1?{data:[participation],total:43,current_page:1,last_page:3}:nextPage.promise;
 await refreshHistory();assert.ok(texts(activityList().props.ListHeaderComponent).includes('Joined activities (43)'),'Count comes from backend total');
 const moreButton=activityList().props.ListFooterComponent,callCount=historyCalls.length;
 moreButton.props.onPress();moreButton.props.onPress();assert.equal(historyCalls.length,callCount+1,'Pagination coalesces duplicate taps');
 assert.deepEqual(historyCalls.at(-1),{page:2,status:undefined});assert.equal(activityList().props.ListFooterComponent.props.disabled,true);
 nextPage.resolve({data:[second],total:43,current_page:2,last_page:3});await flush();assert.deepEqual(Array.from(activityList().props.data,row=>row.id),[88,89]);
 nextPage=deferred();activityList().props.ListFooterComponent.props.onPress();nextPage.reject(new Error('Page unavailable'));await flush();
 assert.ok(texts(activityList().props.ListHeaderComponent).includes('Page unavailable'));assert.equal(activityList().props.data.length,2);
 nextPage=deferred();const retryPage=button(activityList().props.ListHeaderComponent,'Retry'),beforeRetryPage=historyCalls.length;
 retryPage.props.onPress();retryPage.props.onPress();assert.equal(historyCalls.length,beforeRetryPage+1);assert.equal(historyCalls.at(-1).page,3,'Retry repeats the failed page without replacing loaded rows');
 nextPage.resolve({data:[third],total:43,current_page:3,last_page:3});await flush();assert.equal(activityList().props.data.length,3);assert.equal(activityList().props.ListFooterComponent,null);
 const stalePending=deferred(),currentCompleted=deferred();
 historyResult=(_,status)=>status==='pending'?stalePending.promise:currentCompleted.promise;
 await chooseFilter('Pending');await chooseFilter('Completed');
 currentCompleted.resolve({data:[{...third,status:'completed'}],total:1,current_page:1,last_page:1});await flush();
 stalePending.resolve({data:[participation],total:50,current_page:1,last_page:4});await flush();assert.deepEqual(Array.from(activityList().props.data,row=>row.id),[90],'Old filter responses cannot overwrite the current filter');
 historyResult=async()=>{throw new Error('History offline');};await chooseFilter('Rejected');
 assert.ok(texts(activityList().props.ListHeaderComponent).includes('Connection Problem'));assert.equal(activityList().props.ListEmptyComponent,null);
 historyResult=async()=>emptyHistory;button(activityList().props.ListHeaderComponent,'Retry').props.onPress();activityView();await flush();
 assert.ok(texts(activityList().props.ListEmptyComponent).includes('No matching activities'));assert.ok(!texts(activityList().props.ListHeaderComponent).includes('Connection Problem'));
 activityHost.unmount();
 console.log('Phase C Activity checks passed: subtitle/View removal, accessible whole-card participation routes, duplicate-tap guard/reset, chevrons/wrapping, all six statuses and seven filters, backend total, pagination/lock/error/retry, stale-filter protection, empty states and unchanged skeleton behavior. Native layout boundaries mocked.');
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
   if(source==='9'){assert.ok(nodes(view()).some(n=>n.type==='AnnouncementImage' && n.props.uri===admin.image_url));assert.ok(texts(view()).includes('September 14, 2026'));assert.equal(nodes(view()).find(n=>n.type==='Text'&&n.props.children===admin.description).props.numberOfLines,undefined);}
   button(view(),'Evaluate').props.onPress();assert.equal(routes.pop(),'/evaluation','Evaluate keeps the existing self-assessment route');
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
 // Task 03 exercises the actual details screen through its native boundary.
 async function detailsScenario({id='9',notificationId,result={opportunity:admin},error,width=375,fontScale=1}={}){
  const h=host(),routes=[],calls=[],timers=new Map();let response=result,failure=error,currentId=id,currentNotification=notificationId,clock=0,nextTimer=0;
  class ScreenDate extends Date { static now(){return clock;} }
  const auth={opportunity:async key=>{calls.push(['load',key]);if(failure)throw failure;return response;},
   notificationAnnouncement:async key=>{calls.push(['notification',key]);if(failure)throw failure;return response;},
   donationHistory:async()=>({data:[]}),eligibilityState:async()=>({assessment:{result:'eligible'},cooldown_active:true,remaining_seconds:100}),
   joinOpportunity:async key=>{calls.push(['join',key]);throw new ApiError('This announcement is no longer available.',404);}};
  const module=load('src/app/announcement/[id].tsx',{...shared,'@/components/confirmation-modal':{ConfirmationModal:'ConfirmationModal'},
   '@/services/eligibility':eligibility,'react-native':{...native,useWindowDimensions:()=>({width,fontScale})},react:h.react,
   'expo-router':{Stack:{Screen:'Screen'},useFocusEffect:h.focus,useRouter:()=>({push:r=>routes.push(r),back:()=>routes.push('back'),canGoBack:()=>true,replace:r=>routes.push(r)}),useLocalSearchParams:()=>({id:currentId,notificationId:currentNotification})},
   '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{ApiError,errorMessage:e=>e.message}},
   {Date:ScreenDate,setTimeout:(fn,delay)=>{const timer=++nextTimer;timers.set(timer,{fn,at:clock+delay});return timer;},clearTimeout:timer=>timers.delete(timer)});
  const view=()=>h.render(module.default);const initial=view();await flush();
  return {h,view,initial,routes,calls,auth,timers,setId:value=>{currentId=value;},setNotification:value=>{currentNotification=value;},setFailure:value=>{failure=value;},setResponse:value=>{response=value;failure=undefined;},
   advance:milliseconds=>{clock+=milliseconds;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}}};
 }
 const flatStyle=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
 let d=await detailsScenario({result:{opportunity:{...admin,start_time:'09:05:00',end_time:'15:30:00',description_document:richDoc}}});
 let tree=d.view(),copy=texts(tree);
 const safe=nodes(tree).find(n=>n.type==='SafeAreaView');assert.equal(safe.props.style.backgroundColor,'#FFF9F2');
 assert.deepEqual(Array.from(safe.props.edges),['top','right','bottom','left']);
 assert.ok(nodes(d.initial).some(n=>n.type==='TabSkeleton' && n.props.label==='Loading announcement'));assert.equal(button(d.initial,'Go Donate'),undefined,'No actions before loading');
 const headings=nodes(tree).filter(n=>n.type==='Text'&&n.props.accessibilityRole==='header').map(n=>texts(n));
 assert.deepEqual(headings,['Announcement Details',admin.title,'About This Event','LifeFlow Donation Rewards','Before You Donate']);
 for(const label of ['Event Date','September 14, 2026','9:05 AM – 3:30 PM','Event Location',admin.location,'Bring ID','1.','2.','Points are awarded only after an Admin verifies your donation.','300','50','500'])assert.ok(copy.includes(label),label);
 assert.doesNotMatch(copy,/09:05:00|15:30:00/);
 for(const [a,b] of [[admin.title,'Event Date'],['Event Date','Event Location'],['Event Location','About This Event'],['About This Event','LifeFlow Donation Rewards'],['LifeFlow Donation Rewards','Before You Donate'],['Before You Donate','Evaluate']])assert.ok(copy.indexOf(a)<copy.indexOf(b),`${a} before ${b}`);
 assert.equal(nodes(tree).find(n=>n.type==='AnnouncementImage').props.uri,admin.image_url);
 assert.equal(nodes(tree).find(n=>n.type==='AnnouncementImage').props.preview,undefined,'Detail image keeps the full-image default');
 assert.ok(!nodes(tree).some(n=>n.type==='Text'&&n.props.children==='Bloodletting'),'No fabricated category');
 const scroll=nodes(tree).find(n=>n.type==='ScrollView');assert.equal(scroll.props.style.flex,1);
 assert.ok(!nodes(scroll).includes(button(tree,'Evaluate'))&&!nodes(scroll).includes(button(tree,'Go Donate')),'CTA is a layout sibling below scroll content');
 assert.ok(nodes(tree).some(n=>n.type==='View'&&n.props.style?.flexShrink===0&&n.props.style?.backgroundColor==='#FFF9F2'));
 assert.ok(button(tree,'Evaluate').props.style({pressed:false}).some(s=>s?.borderWidth===1));
 assert.ok(button(tree,'Go Donate').props.style({pressed:false}).some(s=>s?.backgroundColor==='#892325'));
 nodes(tree).find(n=>n.props?.accessibilityLabel==='Go back').props.onPress();assert.equal(d.routes.pop(),'back');
 d.h.unmount();
 for(const [width,fontScale,stacked] of [[320,1,true],[375,1,false],[375,2,true],[768,1,false]]){
  d=await detailsScenario({width,fontScale,result:{opportunity:{...admin,title:'A very long event title '.repeat(12),description:'Complete event description. '.repeat(100)}}});tree=d.view();
  const row=nodes(tree).find(n=>n.type==='View'&&Array.isArray(n.props.style)&&n.props.style.some(s=>s?.maxWidth===620&&s?.gap===10));
  assert.equal(flatStyle(row.props.style).flexDirection,stacked?'column':'row');
  for(const label of ['Evaluate','Go Donate']){
   const action=button(tree,label),appearance=flatStyle(action.props.style({pressed:false}));assert.ok(appearance.minHeight>=44);
   assert.equal(appearance.minWidth,0);if(stacked)assert.equal(appearance.flexBasis,'auto','Larger fonts retain natural button height');
  }
  const longText=nodes(tree).find(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.startsWith('Complete event description.'));
  assert.equal(longText.props.numberOfLines,undefined);assert.equal(longText.props.children.length,'Complete event description. '.repeat(100).length);d.h.unmount();
 }
 for(const partial of [{title:'',description:'',location:null,event_date:null,start_time:'bad',end_time:'bad',image_url:null},
   {event_date:'2026-02-30',start_time:'00:00:00',end_time:'12:00:00',image_url:'file:///private/poster.png'}]){
  d=await detailsScenario({result:{opportunity:{...admin,...partial}}});copy=texts(d.view());assert.ok(copy.includes('No event image available')&&copy.includes('Date to be announced'));
  if(partial.title==='')for(const label of ['Announcement','Location to be announced','No event description is available.'])assert.ok(copy.includes(label));
  else assert.ok(copy.includes('12:00 AM – 12:00 PM'));d.h.unmount();
 }
 for(const id of [undefined,'bad-id','../9','0']){
  // Explicit missing parameter must bypass the helper's default ID.
  d=await detailsScenario({id:id===undefined?null:id});assert.ok(texts(d.view()).includes('This announcement is unavailable.'));assert.equal(d.calls.length,0);assert.equal(button(d.view(),'Go Donate'),undefined);d.h.unmount();
 }
 for(const result of [null,{}, {opportunity:null}]){d=await detailsScenario({result});assert.ok(texts(d.view()).includes('This announcement is unavailable.'));assert.equal(button(d.view(),'Go Donate'),undefined);d.h.unmount();}
 d=await detailsScenario({error:new ApiError('Not found',404)});assert.match(texts(d.view()),/no longer available/);assert.equal(button(d.view(),'Go Donate'),undefined);
 d.setResponse({opportunity:admin});button(d.view(),'Retry donation details').props.onPress();await flush();assert.ok(button(d.view(),'Go Donate'));assert.equal(d.calls.filter(c=>c[0]==='load').length,2);d.h.unmount();
 d=await detailsScenario({error:new Error('Network unavailable')});assert.match(texts(d.view()),/Network unavailable/);assert.ok(button(d.view(),'Retry donation details'));d.h.unmount();
 d=await detailsScenario();button(d.view(),'Go Donate').props.onPress();await flush();nodes(d.view()).find(n=>n.type==='ConfirmationModal').props.onPrimary();await flush();
 assert.match(texts(d.view()),/This announcement is no longer available/);assert.equal(d.routes.length,0);assert.equal(d.calls.filter(c=>c[0]==='join').length,1);d.h.unmount();
 const late=deferred();d=await detailsScenario({result:late.promise});d.h.unmount();late.resolve({opportunity:admin});await flush();assert.equal(button(d.view(),'Go Donate'),undefined,'Late detail response cannot restore a departed screen');
 const oldDetail=deferred(),newDetail=deferred();
 d=await detailsScenario({result:oldDetail.promise});d.setResponse(newDetail.promise);d.setId('10');d.view();
 newDetail.resolve({opportunity:{...admin,id:10,title:'New announcement'}});await flush();assert.ok(texts(d.view()).includes('New announcement'));
 oldDetail.resolve({opportunity:admin});await flush();assert.ok(!texts(d.view()).includes(admin.title),'Late previous-route response is discarded');d.h.unmount();
 d=await detailsScenario();const nextDetail=deferred();d.setResponse(nextDetail.promise);d.setId('10');
 const changedRoute=d.view();assert.ok(!texts(changedRoute).includes(admin.title));assert.equal(button(changedRoute,'Go Donate'),undefined);
 nextDetail.reject(new Error('Connection failed'));await flush();assert.ok(button(d.view(),'Retry donation details'));
 assert.ok(!nodes(d.view()).some(n=>n.type==='TabSkeleton'),'Failure resolves the loading skeleton');
 d.setResponse({opportunity:{...admin,id:10,title:'Recovered announcement'}});button(d.view(),'Retry donation details').props.onPress();await flush();assert.ok(texts(d.view()).includes('Recovered announcement'));
 d.setId(undefined);d.view();await flush();assert.ok(texts(d.view()).includes('This announcement is unavailable.'));assert.equal(button(d.view(),'Go Donate'),undefined);d.h.unmount();
 d=await detailsScenario();const pendingJoin=deferred();d.auth.joinOpportunity=()=>pendingJoin.promise;
 button(d.view(),'Go Donate').props.onPress();await flush();nodes(d.view()).find(n=>n.type==='ConfirmationModal').props.onPrimary();await flush();
 d.setResponse({opportunity:{...admin,id:10,title:'Next event'}});d.setId('10');d.view();await flush();
 button(d.view(),'Go Donate').props.onPress();await flush();assert.equal(button(d.view(),'Joining donation activity').props.disabled,true);
 pendingJoin.resolve({participation:{id:222}});await flush();
 assert.equal(d.routes.length,0,'Previous-route join completion must not navigate from the new event');
 assert.equal(button(d.view(),'Joining donation activity').props.disabled,true,'Previous-route cleanup must not unlock the new confirmation');
 nodes(d.view()).find(n=>n.type==='ConfirmationModal').props.onSecondary();assert.equal(button(d.view(),'Go Donate').props.disabled,false);d.h.unmount();
 // 7D: only a validated notification context uses the recipient-scoped archive API.
 const archived={opportunity:{...admin,title:'Retained announcement',image_url:'https://cdn.test/retained.png',description_document:richDoc,
   event_date:'2026-10-28',expires_at:'2026-10-27T16:00:00Z'},view_state:'expired',read_only:true,server_time:'2026-10-27T16:00:00Z'};
 const archivedOriginal=JSON.stringify(archived);
 for(const [width,fontScale] of [[320,1],[390,2]]){
  d=await detailsScenario({notificationId:'17',result:archived,width,fontScale});tree=d.view();copy=texts(tree);
  assert.equal(d.calls.length,1);assert.equal(d.calls[0].join(':'),'notification:17');
  for(const content of ['Retained announcement','Event Location','Bring ID','Expired','viewing only'])assert.ok(copy.includes(content));
  assert.equal(nodes(tree).find(n=>n.type==='AnnouncementImage').props.uri,archived.opportunity.image_url);
  assert.equal(nodes(tree).find(n=>n.type==='AnnouncementImage').props.preview,undefined);
  for(const action of ['Go Donate','Evaluate','Confirm','Register','Participate'])assert.equal(button(tree,action),undefined);
  assert.equal(nodes(tree).filter(n=>n.type==='Pressable').length,1,'Only safe Back remains interactive');
  assert.ok(!nodes(tree).some(n=>n.type==='ConfirmationModal'));
  const badge=nodes(tree).find(n=>n.props?.accessibilityLabel==='Expired announcement');assert.ok(badge);assert.equal(badge.props.numberOfLines,undefined);
  const reads=d.calls.length;d.h.blur();d.view();await flush();assert.equal(d.calls.length,reads+1,'The same read/unread notification can reopen');
  assert.ok(texts(d.view()).includes('Expired'));d.h.unmount();assert.equal(d.timers.size,0);
 }
 assert.equal(JSON.stringify(archived),archivedOriginal,'Read-only rendering never mutates announcement data');
 const activeNotice={...archived,opportunity:{...archived.opportunity,event_date:'2026-10-01'},view_state:'active',read_only:false,server_time:'2026-10-27T15:59:59Z'};
 d=await detailsScenario({notificationId:'17',result:activeNotice});tree=d.view();
 assert.ok(button(tree,'Evaluate')&&button(tree,'Go Donate'),'A past event date alone does not expire a publication');
 assert.ok(!nodes(tree).some(n=>n.props?.accessibilityLabel==='Expired announcement'));
 const staleEvaluate=button(tree,'Evaluate').props.onPress,staleDonate=button(tree,'Go Donate').props.onPress;
 staleDonate();await flush();const staleConfirmation=nodes(d.view()).find(n=>n.type==='ConfirmationModal').props.onPrimary;
 d.advance(1000);tree=d.view();assert.ok(texts(tree).includes('Expired'));assert.equal(button(tree,'Go Donate'),undefined);assert.equal(button(tree,'Evaluate'),undefined);
 assert.ok(!nodes(tree).some(n=>n.type==='ConfirmationModal'));const beforeStale=d.calls.length;
 staleEvaluate();staleDonate();staleConfirmation();await flush();assert.equal(d.routes.length,0);assert.equal(d.calls.length,beforeStale);d.h.unmount();
 // A long publication does not expire early at the native timer's signed-int limit.
 d=await detailsScenario({notificationId:'17',result:{...activeNotice,opportunity:{...activeNotice.opportunity,expires_at:'2027-10-27T16:00:00Z'}}});d.view();
 assert.equal([...d.timers.values()][0].at,2147483647);d.advance(2147483647);assert.ok(button(d.view(),'Go Donate'));d.h.unmount();assert.equal(d.timers.size,0);
 const delayed=deferred();d=await detailsScenario({notificationId:'17',result:delayed.promise});d.advance(1500);delayed.resolve(activeNotice);await flush();
 assert.ok(texts(d.view()).includes('Expired'));assert.equal(button(d.view(),'Go Donate'),undefined,'A response arriving after expiry never flashes active actions');d.h.unmount();
 for(const notificationId of ['0','-1','../17','17x','999999999999999999999',['17']]){
  d=await detailsScenario({notificationId,result:archived});assert.equal(d.calls.length,0);assert.equal(button(d.view(),'Go Donate'),undefined);d.h.unmount();
 }
 d=await detailsScenario({id:'red-cross-dagupan',notificationId:'17',result:archived});assert.equal(d.calls.length,0);d.h.unmount();
 d=await detailsScenario({id:'10',notificationId:'17',result:archived});assert.ok(!texts(d.view()).includes('Retained announcement'));assert.match(texts(d.view()),/unavailable/);d.h.unmount();
 for(const status of [403,404,410,500,503]){
  d=await detailsScenario({notificationId:'17',error:new ApiError('Server unavailable',status)});copy=texts(d.view());
  assert.ok(!copy.includes('Expired'));assert.equal(button(d.view(),'Go Donate'),undefined);assert.ok(button(d.view(),'Retry donation details'));
  if(status<500)assert.match(copy,/no longer available/);else assert.match(copy,/Server unavailable/);
  assert.ok(d.calls.every(call=>call[0]==='notification'),'A denied notice never falls back to unrestricted detail');d.h.unmount();
 }
 d=await detailsScenario({notificationId:'17',result:archived});d.view();d.setFailure(new Error('Offline'));
 d.h.blur();d.view();await flush();assert.ok(texts(d.view()).includes('Retained announcement'));assert.ok(texts(d.view()).includes('Offline'));
 assert.equal(button(d.view(),'Go Donate'),undefined);d.setResponse(archived);button(d.view(),'Retry donation details').props.onPress();await flush();assert.ok(!texts(d.view()).includes('Offline'));
 d.setFailure(new ApiError('Withdrawn',403));d.h.blur();d.view();await flush();assert.ok(!texts(d.view()).includes('Retained announcement'));assert.match(texts(d.view()),/no longer available/);d.h.unmount();
 // Changing notification ID on the same announcement invalidates cached content and late replies.
 const firstNotice=deferred(),nextNotice=deferred();d=await detailsScenario({notificationId:'17',result:firstNotice.promise});
 d.setNotification('18');d.setResponse(nextNotice.promise);assert.ok(!texts(d.view()).includes('Retained announcement'));
 nextNotice.resolve(archived);await flush();assert.ok(texts(d.view()).includes('Retained announcement'));
 firstNotice.resolve({...archived,opportunity:{...archived.opportunity,title:'Previous notification content'}});await flush();
 assert.ok(!texts(d.view()).includes('Previous notification content'));d.h.unmount();
 console.log('7D notification announcement checks passed: recipient-scoped detail, expired read-only content, active/event-date distinction, exact server-time boundary and delayed replies, safe IDs, denied/archive isolation, retry/cached errors and stale confirmation/route guards.');
 const permanentDetails=await detailsScenario({id:'red-cross-dagupan',result:{opportunity:{...savedPermanent,description_document:richDoc}}});
 assert.match(texts(permanentDetails.view()),/Admin edited permanent title|Admin edited preview/);assert.match(texts(permanentDetails.view()),/Bring ID/);
 assert.doesNotMatch(texts(permanentDetails.view()),/Event Date|Date to be announced|Confirm donation arrangements with the chapter\./);
 assert.equal(nodes(permanentDetails.view()).find(n=>n.type==='AnnouncementImage').props.preview,undefined);
 assert.equal(nodes(permanentDetails.view()).find(n=>n.type==='AnnouncementImage').props.uri,savedPermanent.image_url);
 assert.ok(button(permanentDetails.view(),'Go Donate')&&button(permanentDetails.view(),'Evaluate'));permanentDetails.h.unmount();
 console.log('B1 permanent post checks passed: saved content/refetch, zero/one/many board ordering, View All reachability/deduplication, whole-card chevron routes, 32:9 covers, full detail images/rich text and no fabricated dates or offline fallback.');
 console.log('Phase A detail checks passed: structured loading, missing IDs, out-of-order route responses, retry recovery and route-scoped join locks.');
 console.log('Task 03 details UI checks passed: cream theme, screenshot hierarchy, real banner/failure fallback, dates/times/nulls, full safe rich text/plain text, truthful guidance, footer/320/375dp/large-font configuration, Back/Evaluate, invalid/empty/expired/network/retry states and server-rejected join. Native boundaries mocked.');
 console.log('Red Cross / Go Donate checks passed: both sources, ordered validation, popup routes, expiry, cancel, duplicate taps, changed-server-state recovery, offline safety and shared Activity navigation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Executes the real presentation components; no device, API, animation timer or account is used. */
const assert=require('node:assert/strict');
const {load,host,nodes,shared,native,flush}=require('./flowie-test-boundaries.cjs');
const expand=tree=>{
  if(!tree||typeof tree!=='object')return tree;
  if(Array.isArray(tree))return tree.map(expand);
  if(typeof tree.type==='function')return expand(tree.type(tree.props));
  return {...tree,props:{...tree.props,children:expand(tree.props?.children)}};
};
const text=tree=>nodes(tree).filter(n=>n.type==='Text').flatMap(n=>n.props.children).join(' ');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};

(async()=>{
  const h=host();let motion,foreground,starts=0,stops=0,channelListeners=0,settings=deferred();
  const Animated={Value:class{constructor(value){this.value=value;}setValue(value){this.value=value;}},View:'AnimatedView',
    timing:(_,options)=>{assert.equal(options.useNativeDriver,true);assert.equal(options.isInteraction,false);assert.ok(options.duration>=1000);return options;},
    sequence:steps=>steps,loop:()=>({start:()=>{starts++;},stop:()=>{stops++;}})};
  const skeleton=load('src/components/tab-skeleton.tsx',{...shared,react:h.react,'react-native':{...native,Animated,
    AccessibilityInfo:{isReduceMotionEnabled:()=>settings.promise,addEventListener:(_,fn)=>{motion=fn;channelListeners++;return {remove:()=>{motion=null;channelListeners--;}};}},
    AppState:{currentState:'active',addEventListener:(_,fn)=>{foreground=fn;channelListeners++;return {remove:()=>{foreground=null;channelListeners--;}};}},
  }});
  const legacy=skeleton.TabSkeleton({});assert.equal(legacy.props.accessibilityState.busy,true);assert.equal(legacy.props.style[0].padding,16);
  assert.equal(nodes(legacy).some(n=>n.type?.name==='Pulse'),false,'Flowie retains its static placeholder with no animated wrapper');
  const pulse=skeleton.TabSkeleton({variant:'activity',label:'Loading activities'}).props.children;
  const render=()=>h.render(()=>pulse.type(pulse.props));render();assert.equal(starts,0,'No motion before accessibility preference is known');
  settings.resolve(false);await flush();render();assert.equal(starts,1);assert.equal(channelListeners,2);
  motion(true);render();assert.equal(stops,1,'Enabling reduced motion stops the current animation');
  assert.equal(render().props.style.opacity.value,1);motion(false);render();assert.equal(starts,2);
  foreground('background');render();assert.equal(stops,2);foreground('active');render();assert.equal(starts,3);
  h.unmount();assert.equal(stops,3);assert.equal(channelListeners,0);

  const shape=variant=>{
    const element=skeleton.TabSkeleton({variant});
    return expand(element.props.children.props.children);
  };
  const has=(tree,property,value)=>nodes(tree).some(n=>[n.props?.style].flat(Infinity).some(s=>s?.[property]===value));
  assert.ok(has(shape('announcement'),'aspectRatio',16/9));assert.ok(has(shape('detail'),'aspectRatio',16/9));
  assert.ok(has(shape('points'),'borderRadius',90));assert.ok(has(shape('profile'),'borderRadius',56));
  assert.ok(has(shape('notifications'),'width',40));assert.ok(has(shape('notifications'),'width',8));
  assert.ok(has(shape('rewards'),'aspectRatio',1));assert.ok(has(shape('activity'),'height',24));
  assert.ok(nodes(shape('profile-fields')).length>nodes(shape('profile')).length);
  for(const variant of ['activity','rewards','notifications','profile','profile-fields','profile-summary','status','points','transactions','my-rewards']){
    const tree=skeleton.TabSkeleton({variant});assert.equal(tree.props.accessibilityRole,'progressbar');
    assert.equal(tree.props.children.props.children.props.importantForAccessibility,'no-hide-descendants');
  }
  const r=host();const states=load('src/components/load-state.tsx',{...shared,react:r.react});
  assert.equal(states.loadErrorKind('Cannot reach LifeFlow. Check your connection and try again.'),'connection');
  assert.equal(states.loadErrorKind('The server could not complete the request.'),'server');
  assert.equal(states.loadErrorKind('The server returned an unreadable response.'),'server');
  assert.equal(states.loadErrorKind('Your session has expired. Please log in again.'),'session');
  let calls=0,pending=deferred();const props={message:'Offline',subject:'activities',onRetry:()=>{calls++;return pending.promise;}};
  const error=()=>r.render(()=>states.LoadError(props));
  assert.match(text(error()),/Connection Problem/);assert.ok(nodes(error()).some(n=>n.props?.name==='wifi-off'));
  const retry=nodes(error()).find(n=>n.type==='Pressable');retry.props.onPress();retry.props.onPress();assert.equal(calls,1);
  pending.resolve();await flush();pending=deferred();nodes(error()).find(n=>n.type==='Pressable').props.onPress();assert.equal(calls,2);pending.resolve();await flush();
  props.loading=true;const busy=nodes(error()).find(n=>n.type==='Pressable');assert.equal(busy.props.disabled,true);assert.equal(busy.props.accessibilityState.busy,true);busy.props.onPress();assert.equal(calls,2);
  props.loading=false;props.message='Your session has expired. Please log in again.';assert.equal(nodes(error()).filter(n=>n.type==='Pressable').length,0);
  props.message='Server unavailable';props.onRetry=async()=>{calls++;throw Error('Still unavailable');};
  await nodes(error()).find(n=>n.type==='Pressable').props.onPress();await nodes(error()).find(n=>n.type==='Pressable').props.onPress();assert.equal(calls,4,'A failed retry releases its lock for another attempt');
  props.message='Request timed out';props.action=true;assert.match(text(error()),/Action not confirmed/);assert.match(text(error()),/Request timed out/);
  const empty=states.EmptyState({title:'No matching activities',description:'Try another status filter.'});assert.match(text(empty),/Try another status filter/);assert.equal(nodes(empty).filter(n=>n.type==='Pressable').length,0);
  r.unmount();
  // Initial profile failure must leave a reachable retry outside the dynamic placeholders.
  const p=host();let request=deferred(),reads=0;
  const api={ApiError:class extends Error{},errorMessage:error=>error.message};
  const authService=load('src/services/auth.ts',{'./api':api});
  const auth={user:{id:1,name:'Test Donor',email:'test@example.test'},profile:null,busy:false,
    loadProfile:async()=>{reads++;auth.profile=await request.promise;},
    donationSummary:async()=>({total_donations:0,achievement:{label:'New Donor'}}),saveProfile:async()=>{},logout:async()=>{}};
  const guard={register:()=>()=>{},requestLeave:fn=>fn()};
  const profile=load('src/app/(tabs)/profile.tsx',{...shared,react:p.react,
    'react-native':{...native,BackHandler:{addEventListener:()=>({remove(){}})},ActivityIndicator:'Spinner'},
    'expo-router':{useRouter:()=>({push(){},replace(){}}),useFocusEffect:p.focus},
    '@/contexts/auth-context':{useAuth:()=>auth},'@/contexts/tab-leave-context':{useTabLeave:()=>guard},
    '@/constants/profile-settings':{profileMascotImage:()=>null},'@/services/auth':authService,'@/services/api':api,
    '@/components/notification-bell':{NotificationBell:'Bell'},'@/components/confirmation-modal':{ConfirmationModal:'Confirmation'},
    '@/components/birth-date-picker':{__esModule:true,default:'BirthDatePicker'},'@/components/load-state':states,
  });
  const profileView=()=>p.render(profile.default);profileView();assert.match(text(profileView()),/Profile Information/);
  assert.ok(nodes(profileView()).some(n=>n.type==='TabSkeleton'&&n.props.variant==='profile-fields'));
  request.reject(Error('Offline'));await flush();
  const failed=nodes(profileView()).find(n=>n.type===states.LoadError&&n.props.subject==='profile');assert.ok(failed,'Initial failure does not hide Retry behind a page skeleton');
  request=deferred();const beforeRetry=reads;failed.props.onRetry();failed.props.onRetry();assert.equal(reads,beforeRetry+1);
  request.resolve({first_name:'Recovered',middle_name:null,last_name:'Donor',mobile_number:'09171234567',birth_date:'2002-10-19',gender:'Male',blood_type:'O+'});await flush();
  assert.match(text(profileView()),/Recovered/);assert.ok(!nodes(profileView()).some(n=>n.type==='TabSkeleton'));
  p.blur();request=deferred();p.refocus();profileView();assert.ok(!nodes(profileView()).some(n=>n.type==='TabSkeleton'),'Background refresh retains loaded profile');
  request.reject(Error('Offline'));await flush();assert.match(text(profileView()),/Recovered/);assert.ok(nodes(profileView()).some(n=>n.type===states.LoadError));p.unmount();
  console.log('PASS: screen-specific geometry, static Flowie fallback, gentle native pulse, reduce-motion/background/unmount cleanup, truthful errors/session handling, retry locking/recovery and simple empty states.');
})().catch(error=>{console.error(error);process.exitCode=1;});

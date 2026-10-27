/* Actual service/hook/screen handlers; native and React boundaries are mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={},globals={}){
 if(!imports['@/components/load-state'] && path!=='src/components/load-state.tsx' && imports['react/jsx-runtime'] && imports['@expo/vector-icons/MaterialIcons'] && imports.react)imports={...imports,'@/components/load-state':load('src/components/load-state.tsx',imports,globals)};
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>{if (n === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}}); if(n.endsWith('.png')){assert.ok(fs.existsSync(require('node:path').resolve(require('node:path').dirname(path),n)));return n;}if(!(n in imports))throw Error('Unexpected import '+n);return imports[n];},...globals});return module.exports;
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const texts=v=>nodes(v).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children).join('\n');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&texts(n).includes(label));
const native={BackHandler:{addEventListener:()=>({remove(){}}),exitApp(){}},Platform:{OS:'android'},KeyboardAvoidingView:'KeyboardAvoidingView',View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',ScrollView:'ScrollView',TextInput:'TextInput',StyleSheet:{create:x=>x},Alert:{alert:()=>{throw Error('Unexpected validation alert');}}};
const shared={'@/components/tab-skeleton':{TabSkeleton:'TabSkeleton'},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'}};
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
 const service=load('src/services/auth.ts',{'./api':{apiRequest:async(path,options)=>{requests.push({path,options});},ApiError:class extends Error{}}});
 const donorNames=[['Suffer F Cruz','Suffer F. Cruz'],['Mark D Javines','Mark D. Javines'],['Suffer F. Cruz','Suffer F. Cruz'],['Suffer F.. Cruz','Suffer F. Cruz'],['Maria Santos','Maria Santos'],['Suffer Francisco Cruz','Suffer Francisco Cruz'],[null,''],[undefined,''],['','']];
 for(const [source,expected] of donorNames){
   assert.equal(service.formatDonorName(source),expected);
   assert.equal(service.formatDonorName(service.formatDonorName(source)),expected);
 }
 const form={firstName:'Juan',middleName:'',lastName:'Cruz',email:'juan@example.com',mobileNumber:'09171234567',birthDate:'09/17/2004',gender:'Male',bloodType:'O+'};
 assert.deepEqual(Array.from(service.BLOOD_TYPES),['A+','A-','B+','B-','AB+','AB-','O+','O-']);
 for(const mobile of ['09171234567','+639171234567','639171234567','+63 (917) 123-4567']){
   const profile={...form,first_name:'Juan',middle_name:null,last_name:'Cruz',mobile_number:mobile,birth_date:'2002-10-19',gender:'Male',blood_type:'O+'};
   const original=JSON.stringify(profile),draft=service.toProfileForm({email:form.email},profile);
   assert.equal(draft.mobileNumber,'09171234567');assert.equal(service.toProfileUpdatePayload(draft).mobile_number,'09171234567');
   assert.equal(JSON.stringify(profile),original,'Displaying a legacy phone number never mutates saved data');
 }
 assert.equal(service.profileMobileNumber(null),'');assert.equal(service.profileMobileNumber(undefined),'');
 assert.equal(service.cleanProfileMobileInput(' (0917) 123-4567 '),'09171234567');
 for(const [value,expected] of [['091712345678999','09171234567'],['09abc17 123-4567','09171234567'],['letters +()-',''],['0917','0917'],['08171234567','08171234567']])assert.equal(service.cleanProfileMobileInput(value),expected);
 for(const mobile of ['','08171234567','02171234567','0917123456','091712345678','09171234x67','+639171234567','639171234567','09171234567\n'])assert.ok(service.profileEditErrors({...form,mobileNumber:mobile}).mobileNumber,mobile);
 for(const bloodType of ['','Unknown','A','o+',null])assert.ok(service.profileEditErrors({...form,bloodType}).bloodType);
 for(const bloodType of service.BLOOD_TYPES)assert.equal(Object.keys(service.profileEditErrors({...form,bloodType})).length,0);
 assert.equal(service.toProfilePayload({...form,mobileNumber:'+639171234567'}).mobile_number,'+639171234567','Registration serialization remains compatible with international input');
 for(const [value,expected] of [['10/19/2002','October 19, 2002'],['01/01/2000','January 1, 2000'],['02/29/2000','February 29, 2000'],['02/29/1900',''],['invalid',''],['',''],[null,'']])assert.equal(service.profileBirthDate(value),expected);
 await service.authApi.updateProfile('private',form);
 assert.deepEqual(Object.keys(requests[0].options.body).sort(),['birth_date','blood_type','first_name','gender','last_name','middle_name','mobile_number']);
 assert.equal(requests[0].options.body.birth_date,'2004-09-17');assert.equal(service.toProfilePayload(form).email,form.email);
 const legacyProfile={...service.toProfileUpdatePayload(form),middle_name:'Santos'};
 const legacyForm=service.toProfileForm({email:form.email},legacyProfile);assert.equal(legacyForm.middleName,'S');assert.equal(legacyProfile.middle_name,'Santos');
 assert.equal(service.formatMiddleInitial(legacyProfile.middle_name),'S.');assert.equal(legacyProfile.middle_name,'Santos');
 assert.equal(service.toProfileUpdatePayload({...legacyForm,middleName:' s '}).middle_name,'S');
 assert.throws(()=>service.toProfileUpdatePayload({...form,middleName:'Sa'}),/one alphabetic middle initial/);
 assert.throws(()=>service.toProfileUpdatePayload({...form,middleName:'2'}),/one alphabetic middle initial/);
 const adult=service.latestBirthDate(),formatDate=date=>`${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}/${date.getFullYear()}`;
 assert.ok(service.toProfileUpdatePayload({...form,birthDate:formatDate(adult)}));adult.setDate(adult.getDate()+1);
 assert.throws(()=>service.toProfileUpdatePayload({...form,birthDate:formatDate(adult)}),/at least 18/);
 const routes=[];const h=host();let saves=0,pending;
 const auth={user:{id:1,name:'Juan Cruz',email:form.email,email_verified_at:null},profile:service.toProfileUpdatePayload(form),busy:false,
 loadProfile:async()=>{},donationSummary:async()=>({total_donations:0,achievement:{label:'New Donor'}}),
 saveProfile:async draft=>{saves++;if(pending)await pending.promise;auth.profile=service.toProfileUpdatePayload(draft);},logout:async()=>{}};
 const profileRouter={replace:r=>routes.push(r),push:r=>routes.push(r)};
 let leaveGuard; const tabGuard={register:fn=>{leaveGuard=fn;return()=>{leaveGuard=null;};},requestLeave:fn=>leaveGuard ? leaveGuard(fn) : fn()};
 const screen=load('src/app/(tabs)/profile.tsx',{'@/constants/profile-settings':load('src/constants/profile-settings.ts'),...shared,react:h.react,'expo-router':{useRouter:()=>profileRouter,useFocusEffect:h.focus},
 '@/contexts/tab-leave-context':{useTabLeave:()=>tabGuard},'@/components/confirmation-modal':{ConfirmationModal:'ConfirmationModal'},'@/components/birth-date-picker':{__esModule:true,default:'BirthDatePicker'},'@/components/notification-bell':{NotificationBell:'NotificationBell'},
 '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{errorMessage:e=>e.message},'@/services/auth':service});
 const view=()=>h.render(screen.default);view();await flush();
 const savedUser=auth.user,savedProfile=auth.profile;
 auth.profile=null;
 for(const [source,expected] of donorNames.filter(([source])=>typeof source==='string'&&source)){
   auth.user={...savedUser,name:source};
   const tree=view();
   assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.children===expected));
   assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel===expected+' profile picture'));
   assert.equal(auth.user.name,source);
 }
 auth.user=savedUser;auth.profile=savedProfile;
 const avatarTree=view(),frame=nodes(avatarTree).find(n=>n.type==='View'&&n.props.accessibilityLabel?.endsWith(' profile picture'));
 assert.ok(frame);assert.equal(frame.props.style.width,frame.props.style.height);assert.equal(frame.props.style.borderRadius,frame.props.style.width/2);
 assert.equal(frame.props.style.overflow,'hidden');assert.equal(frame.props.style.backgroundColor,'#FFF9F2');assert.equal(frame.props.style.elevation,undefined);assert.equal(frame.props.style.shadowOpacity,undefined);
 const mascot=nodes(frame).find(n=>n.type==='Image');assert.equal(mascot.props.resizeMode,'contain');assert.equal(mascot.props.style.width,mascot.props.style.height);
 assert.ok(mascot.props.style.width<=frame.props.style.width-2*frame.props.style.borderWidth);
 const badge=nodes(avatarTree).find(n=>n.props?.accessibilityLabel==='Change Avatar');assert.ok(badge.props.hitSlop>=7);assert.equal(badge.props.style({pressed:false})[0].zIndex,1);
 for(const [source,initial] of [['C','C.'],['C.','C.'],['c','C.'],[' c. ','C.'],['C..','C.'],['Cruz','C.'],[null,''],['',''],['   ',''],[undefined,'']]){
   const original=auth.profile;auth.profile={...original,middle_name:source};
   const tree=view(),expectedName=initial?'Juan '+initial+' Cruz':'Juan Cruz';
   assert.equal(service.formatMiddleInitial(source),initial);
   assert.ok(nodes(tree).some(n=>n.type==='Text'&&n.props.children===expectedName));
   assert.ok(nodes(tree).some(n=>n.props?.accessibilityLabel===expectedName+' profile picture'));
   const row=nodes(tree).find(n=>n.type==='View'&&n.props.children?.[0]?.type==='Text'&&n.props.children[0].props.children==='Middle Initial (Optional)');
   assert.equal(row.props.children[1].props.children,initial || '--');
   assert.equal(auth.profile.middle_name,source,'Rendering does not mutate stored profile data');
   assert.equal(service.toProfileForm(auth.user,auth.profile).middleName,initial.replace('.',''));
   assert.equal(service.toProfileUpdatePayload(service.toProfileForm(auth.user,auth.profile)).middle_name,initial?initial[0]:null);
   if(initial){
     button(view(),'Edit Profile').props.onPress();
     assert.equal(nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Middle Initial (Optional)').props.value,'C');
     button(view(),'Cancel').props.onPress();
   }
   auth.profile=original;
 }
 for(const label of ['Profile Information','First Name','Middle Initial (Optional)','Last Name','Email','Mobile Number','Birth Date','Gender','Blood Type','Total Donations','Donor Achievement','Profile Settings'])assert.ok(texts(view()).includes(label),label);
 assert.ok(texts(view()).includes('--'));assert.ok(!texts(view()).includes('Verified'));
 // A subsequent server summary updates the existing donation count/achievement display.
 auth.donationSummary=async()=>({total_donations:3,achievement:{label:'Bronze Donor'}});
 view();await flush();
 assert.ok(nodes(view()).some(n=>n.type==='Text' && n.props.children===3));
 assert.ok(texts(view()).includes('Bronze Donor'));
 for(const state of [null,undefined,false,'']){auth.user.email_verified_at=state;assert.ok(!texts(view()).includes('Verified'));}
 auth.user.email_verified_at='2026-09-14T00:00:00Z';assert.ok(texts(view()).includes('Verified'));
 const originalEmail=auth.user.email;auth.user.email='long.donor.address.with.many.parts@example.test';
 const email=nodes(view()).find(n=>n.type==='Text'&&n.props.accessibilityLabel===auth.user.email+', verified email');
 assert.ok(email);assert.equal(email.props.numberOfLines,undefined);assert.equal(email.props.style[1].lineHeight,22);
 const verified=nodes(email).find(n=>n.type==='Text'&&n.props.style?.color==='#15803D');assert.ok(verified,'Verified stays inline inside the email text flow');
 assert.ok(nodes(verified).some(n=>n.props?.name==='check-circle'&&n.props.color==='#15803D'));auth.user.email=originalEmail;
 const informationRow=label=>nodes(view()).find(n=>n.type==='View'&&n.props.children?.[0]?.type==='Text'&&n.props.children[0].props.children===label);
 const priorProfile=auth.profile;auth.profile={...auth.profile,mobile_number:'+639171234567',birth_date:'2002-10-19'};
 assert.equal(informationRow('Mobile Number').props.children[1].props.children,'09171234567');
 assert.equal(informationRow('Birth Date').props.children[1].props.children,'October 19, 2002');
 const radios=()=>nodes(view()).filter(n=>n.props?.accessibilityRole==='radio');
 const input=label=>nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);
 const beforeRestore=auth.profile;auth.profile={...auth.profile,mobile_number:'091712345678999'};
 button(view(),'Edit Profile').props.onPress();assert.equal(input('Mobile Number').props.value,'09171234567','Restored draft is capped before the native input mounts');
 button(view(),'Cancel').props.onPress();assert.equal(auth.profile.mobile_number,'091712345678999','Cancel never rewrites stored values');auth.profile=beforeRestore;
 button(view(),'Edit Profile').props.onPress();assert.equal(input('Mobile Number').props.value,'09171234567');
 assert.equal(input('Mobile Number').props.keyboardType,'phone-pad');assert.equal(input('Mobile Number').props.placeholder,'09XXXXXXXXX');
 assert.equal(input('Mobile Number').props.maxLength,11);
 for(const value of ['091712345678999','09abc17 123-4567']){
   input('Mobile Number').props.onChangeText(value);assert.equal(input('Mobile Number').props.value,'09171234567');
 }
 let typed='';for(const digit of '091712345678999'){
   input('Mobile Number').props.onChangeText(typed+digit);typed=input('Mobile Number').props.value;
   assert.ok(typed.length<=11);assert.match(typed,/^[0-9]*$/);
 }
 assert.equal(typed,'09171234567');
 input('Mobile Number').props.onChangeText('09');button(view(),'Save Profile').props.onPress();await flush();assert.equal(saves,0);
 assert.ok(texts(view()).includes('Enter an 11-digit mobile number starting with 09.'));
 input('Mobile Number').props.onChangeText('0917-123-4567'.slice(0,11));button(view(),'Save Profile').props.onPress();await flush();assert.equal(saves,0,'A formatted paste truncated by native maxLength cannot save an incomplete number');
 assert.deepEqual(radios().map(n=>n.props.accessibilityLabel),Array.from(service.BLOOD_TYPES));assert.equal(radios().find(n=>n.props.accessibilityState.selected).props.accessibilityLabel,'O+');
 assert.ok(radios().every(n=>n.props.style[0].minHeight>=44));assert.equal(input('Blood Type'),undefined);
 radios().find(n=>n.props.accessibilityLabel==='AB-').props.onPress();assert.equal(auth.profile.blood_type,'O+');
 button(view(),'Cancel').props.onPress();button(view(),'Edit Profile').props.onPress();assert.equal(radios().find(n=>n.props.accessibilityState.selected).props.accessibilityLabel,'O+');
 input('Mobile Number').props.onChangeText('08171234567');button(view(),'Save Profile').props.onPress();await flush();assert.equal(saves,0);assert.ok(texts(view()).includes('Enter an 11-digit mobile number starting with 09.'));
 input('Mobile Number').props.onChangeText(' (0917) 123-4567 ');assert.equal(input('Mobile Number').props.value,'09171234567');
 radios().find(n=>n.props.accessibilityLabel==='AB-').props.onPress();button(view(),'Save Profile').props.onPress();await flush();assert.equal(auth.profile.blood_type,'AB-');assert.equal(auth.profile.mobile_number,'09171234567');
 assert.ok(!input('Mobile Number'));auth.profile={...priorProfile,blood_type:'Unknown'};
 button(view(),'Edit Profile').props.onPress();assert.ok(radios().every(n=>!n.props.accessibilityState.selected));
 const beforeInvalid=saves;button(view(),'Save Profile').props.onPress();await flush();assert.equal(saves,beforeInvalid);assert.ok(texts(view()).includes('Select your blood type.'));
 button(view(),'Cancel').props.onPress();auth.profile=priorProfile;saves=0;
 const edit=button(view(),'Edit Profile');const style=Object.assign({},...edit.props.style({pressed:false}));assert.equal(style.backgroundColor,undefined);assert.equal(style.alignItems,'flex-end');edit.props.onPress();
 assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,5);assert.ok(!nodes(view()).some(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Email'));assert.ok(texts(view()).includes('Change email in Profile Settings.'));
 nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='First Name').props.onChangeText('Ana');
 nodes(view()).find(n=>n.type==='BirthDatePicker').props.onChange('01/02/2000');
 pending=deferred();const save=button(view(),'Save Profile');save.props.onPress();save.props.onPress();assert.equal(saves,1);
 let leftDuringSave=false;tabGuard.requestLeave(()=>{leftDuringSave=true;});assert.equal(leftDuringSave,false);
 pending.resolve();await flush();assert.equal(auth.profile.first_name,'Ana');assert.equal(auth.profile.birth_date,'2000-01-02');assert.ok(texts(view()).includes('Profile saved.'));
 button(view(),'Edit Profile').props.onPress();button(view(),'Cancel').props.onPress();assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,0);

 let navigations=0;
 button(view(),'Edit Profile').props.onPress();view();tabGuard.requestLeave(()=>navigations++);
 assert.equal(navigations,1);assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,0);
 button(view(),'Edit Profile').props.onPress();
 nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='First Name').props.onChangeText('Unsaved');view();
 tabGuard.requestLeave(()=>navigations++);
 let modal=nodes(view()).find(n=>n.type==='ConfirmationModal');assert.equal(modal.props.visible,true);assert.equal(navigations,1);
 modal.props.onSecondary();assert.equal(nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='First Name').props.value,'Unsaved');
 tabGuard.requestLeave(()=>navigations++);modal=nodes(view()).find(n=>n.type==='ConfirmationModal');modal.props.onPrimary();view();
 assert.equal(navigations,2);assert.equal(auth.profile.first_name,'Ana');assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,0);

 // Exercise the actual tab listener: navigation must wait for the Profile decision.
 let tabProps, tabTopInset = 44, tabTheme, tabFontScale = 1;
 const tabLayout=load('src/app/(tabs)/_layout.tsx',{...shared,'@expo/vector-icons/MaterialCommunityIcons':{__esModule:true,default:'CommunityIcon'},
 'react-native':{...native,useWindowDimensions:()=>({width:360,height:800,fontScale:tabFontScale})},
 'expo-router':{Tabs:Object.assign(props=>{tabProps=props;return null;},{Screen:'Screen'})},
 'expo-router/react-navigation':{DefaultTheme:{dark:false,colors:{}},ThemeProvider:({value,children})=>{tabTheme=value;return children;}},
 'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:tabTopInset,bottom:0})},
 '@/components/sliding-tab-bar':{SlidingTabBar:'SlidingTabBar'},
 '@/components/haptic-tab':{HapticTab:'HapticTab'},'@/contexts/tab-leave-context':{useTabLeave:()=>tabGuard,TabLeaveProvider:({children})=>children}});
 tabLayout.default();
 // Exercise the installed pressable so its default themed Android ripple cannot leak through.
 assert.equal(tabProps.screenOptions.animation,undefined);
 assert.equal(tabTheme.dark,false);assert.equal(tabTheme.colors.background,'#FFF9F2');assert.equal(tabTheme.colors.card,'#FFF9F2');
 assert.equal(tabProps.screenOptions.lazy,undefined,'Keep the installed lazy mounting default; do not eagerly load donor tabs');
 assert.equal(tabProps.screenOptions.tabBarActiveTintColor,'#892325');
 assert.equal(tabProps.screenOptions.tabBarInactiveTintColor,'rgba(37,2,2,0.72)');
 assert.equal(tabProps.children.map(tab=>tab.props.name).join(','),'index,activity,points,status,profile');
 assert.equal(tabProps.children.map(tab=>tab.props.options.title).join(','),'Home,Activity,Points,Status,Profile');
 assert.equal(tabProps.screenOptions.tabBarLabelPosition,'below-icon');
 assert.equal(tabProps.screenOptions.tabBarActiveBackgroundColor,'transparent');
 assert.equal(tabProps.screenOptions.tabBarInactiveBackgroundColor,'transparent');
 assert.equal(tabProps.screenOptions.tabBarStyle[0].borderWidth,0);
 assert.equal(tabProps.screenOptions.tabBarStyle[0].borderTopWidth,0);
 assert.equal(tabProps.screenOptions.tabBarStyle[0].elevation,0);
 assert.equal(tabProps.screenOptions.tabBarStyle[0].shadowOpacity,0);
 for(const tab of tabProps.children){
   const icon=tab.props.options.tabBarIcon({color:'#892325',focused:true});
   assert.equal(nodes(icon).filter(n=>n.type==='View').length,1,'Icon has no redundant selection line/background');
   assert.equal(nodes(icon).filter(n=>['Icon','CommunityIcon'].includes(n.type)).length,1);
 }
 const originalHeight=tabProps.screenOptions.tabBarStyle[1].height;
 tabFontScale=2;tabLayout.default();assert.ok(tabProps.screenOptions.tabBarStyle[1].height>originalHeight);
 assert.ok(tabProps.screenOptions.sceneStyle.paddingBottom>tabProps.screenOptions.tabBarStyle[1].height);
 tabFontScale=1;tabLayout.default();
 // One background pill follows committed navigation state; the installed native
 // tab bar continues to own press handlers, accessibility, haptics and guards.
 {
 const boundary=require('./flowie-test-boundaries.cjs'),pillHost=boundary.host();
 const timings=[],values=[],nativePositionReads=[];let motionChanged,removed=0,resolveMotion;
 const motionPreference=new Promise(resolve=>{resolveMotion=resolve;});
 const pillNative={...boundary.native,I18nManager:{isRTL:false},Easing:{sin:t=>1-Math.cos(t*Math.PI/2),inOut:easing=>t=>t<0.5?easing(t*2)/2:1-easing((1-t)*2)/2},
   AccessibilityInfo:{isReduceMotionEnabled:()=>motionPreference,addEventListener:(event,callback)=>{assert.equal(event,'reduceMotionChanged');motionChanged=callback;return {remove:()=>removed++};}},
   Animated:{View:'AnimatedPill',Value:class{constructor(value){this.value=value;this.stops=0;values.push(this);}setValue(value){this.value=value;}stopAnimation(callback){this.stops++;const position=this.value;if(callback)nativePositionReads.push(()=>callback(position));}},
     timing:(value,config)=>{const call={value,config,started:false,stopped:false};timings.push(call);return {start:()=>{call.started=true;call.from=value.value;},stop:()=>{call.stopped=true;}};}}};
 const flushPositionReads=()=>{while(nativePositionReads.length)nativePositionReads.shift()();};
 const sliding=boundary.load('src/components/sliding-tab-bar.tsx',{
   ...boundary.shared,react:pillHost.react,'react-native':pillNative,'expo-router/js-tabs':{BottomTabBar:'NativeBottomTabBar'},
 });
 const committed={index:4,routes:['index','activity','points','status','profile'].map(name=>({name,key:name}))};
 const descriptors=Object.fromEntries(committed.routes.map(route=>[route.key,{options:{tabBarButton:'ExistingHaptic',tabBarLabel:route.name,tabBarHideOnKeyboard:true}}]));
 const nativeProps={state:committed,descriptors,navigation:{emit:()=>{}},insets:{top:44,bottom:24,left:10,right:0}};
 const originalDescriptors=JSON.stringify(descriptors);
 const bar=()=>sliding.SlidingTabBar(nativeProps);
 let barTree=bar();assert.equal(barTree.type,'NativeBottomTabBar');
 for(const key of ['state','navigation','insets'])assert.equal(barTree.props[key],nativeProps[key]);
 assert.equal(barTree.props.descriptors.profile.options.tabBarButton,'ExistingHaptic');
 assert.equal(barTree.props.descriptors.profile.options.tabBarHideOnKeyboard,true);
 const background=()=>bar().props.descriptors[committed.routes[committed.index].key].options.tabBarBackground();
 const backgroundType=background().type;
 const pillView=()=>pillHost.render(()=>backgroundType(background().props));
 let pillTree=pillView();assert.equal(boundary.nodes(pillTree).filter(n=>n.type==='AnimatedPill').length,1);
 assert.equal(pillTree.props.pointerEvents,'none');assert.equal(pillTree.props.importantForAccessibility,'no-hide-descendants');
 const appearance=tree=>Object.assign({},...boundary.nodes(tree).find(n=>n.type==='AnimatedPill').props.style);
 assert.equal(appearance(pillTree).opacity,0);
 pillTree.props.onLayout({nativeEvent:{layout:{width:360}}});pillTree=pillView();
 assert.equal(values[0].value,294,'First deep-linked Profile placement is immediate');assert.equal(timings.length,0);
 assert.equal(appearance(pillTree).backgroundColor,'#FFCAD0');assert.equal(appearance(pillTree).height,30);
 assert.equal(appearance(pillTree).borderRadius,15);assert.equal(appearance(pillTree).width,44);
 resolveMotion(false);await flush();pillView();assert.equal(timings.length,0,'Resolving accessibility preference does not animate initial placement');
 const transition=(index,duration,target)=>{
   const count=timings.length,from=values[0].value;
   committed.index=index;assert.equal(background().type,backgroundType,'Route changes preserve the same background component');pillView();
   assert.equal(timings.length,count,'Wait for the stopped native position before retargeting');flushPositionReads();
   assert.equal(timings.length,count+1,'Exactly one animation to the final route, with no intermediate hops');
   const call=timings.at(-1);assert.equal(call.config.toValue,target);assert.equal(call.config.duration,duration);assert.equal(call.from,from);
   assert.equal(call.config.useNativeDriver,true);assert.equal(call.config.isInteraction,false);assert.ok(call.started);
   const curve=call.config.easing;assert.equal(curve(0),0);assert.equal(curve(1),1);assert.ok(Math.abs(curve(0.5)-0.5)<1e-10);
   assert.ok(curve(0.1)<0.05,'Gentle start instead of an abrupt ease-out launch');
   let prior=-1;
   for(let frame=0;frame<=24;frame++){
     const progress=curve(frame/24);assert.ok(progress>prior,'Continuous monotonic easing, with no intermediate stops or bounce');prior=progress;
     values[0].value=from+(target-from)*progress;pillView();
     assert.equal(bar().props.state.index,index,'Visual crossing never selects an intermediate tab');
   }
   assert.equal(timings.length,count+1,'Same-route renders do not restart motion');
   return call;
 };
 transition(0,400,22); // Profile -> Home (Back/programmatic route update).
 transition(1,220,90);transition(0,220,22); // Home <-> Activity.
 transition(2,280,158);transition(0,280,22); // Home <-> Points.
 const longJump=transition(4,400,294); // Home -> Profile (deep link or tab).
 // Interrupt halfway through a long crossing, then reverse from its visual
 // position. A stale destination would incorrectly give this another 400 ms.
 committed.index=0;pillView();flushPositionReads();const interrupted=timings.at(-1);values[0].value=158;
 committed.index=4;pillView();assert.ok(interrupted.stopped);flushPositionReads();
 const retarget=timings.at(-1);assert.equal(retarget.from,158);assert.equal(retarget.config.toValue,294);assert.equal(retarget.config.duration,280);
 assert.ok(longJump.stopped);
 // Native position reads can arrive asynchronously and out of date. Only the
 // newest committed route may start an animation, including after Reduce Motion.
 committed.index=0;pillView();const beforeRace=timings.length;
 committed.index=1;pillView();flushPositionReads();assert.equal(timings.length,beforeRace+1);assert.equal(timings.at(-1).config.toValue,90);
 committed.index=3;pillView();const beforeReduce=timings.length;
 motionChanged(true);pillView();flushPositionReads();assert.equal(timings.length,beforeReduce);assert.ok(timings.at(-1).stopped);assert.equal(values[0].value,226);
 committed.index=0;pillView();assert.equal(values[0].value,22);assert.equal(timings.length,beforeReduce,'Reduce Motion makes route changes instant');
 motionChanged(false);pillView();
 pillView().props.onLayout({nativeEvent:{layout:{width:640}}});pillView();assert.equal(values[0].value,50);assert.equal(timings.length,beforeReduce,'Rotation snaps to the measured slot without a cross-bar sweep');
 pillNative.I18nManager.isRTL=true;pillView();assert.equal(values[0].value,546);
 pillNative.I18nManager.isRTL=false;committed.index=2;pillView();
 assert.equal(JSON.stringify(descriptors),originalDescriptors,'Do not mutate native descriptors or navigation state from a press');
 committed.index=4;pillView();const beforeUnmount=timings.length;
 assert.equal(values.length,1);pillHost.unmount();flushPositionReads();assert.equal(removed,1);assert.equal(timings.length,beforeUnmount,'Unmount cancels pending native callbacks');
 }
 for(const os of ['android','ios'])for(const dark of [false,true])for(const disabled of [false,true]){
   const animatedValues=[],feedback=[],events=[];
   const pressNative={...native,Platform:{OS:os,Version:35},Pressable:'NativePressable',
     Easing:{quad:'quad',inOut:value=>value},Animated:{
       createAnimatedComponent:()=> 'NativePressable',
       Value:class{constructor(value){this.value=value;animatedValues.push(this);}},
       timing:(value,config)=>({start:()=>{value.value=config.toValue;}}),
     }};
   const pressable=load('node_modules/expo-router/build/react-navigation/elements/PlatformPressable.js',{
     'react/jsx-runtime':shared['react/jsx-runtime'],react:{useState:initial=>[initial(),()=>{}]},
     'react-native':pressNative,'../native':{useTheme:()=>({dark})},
   });
   const haptic=load('src/components/haptic-tab.tsx',{
     'react/jsx-runtime':shared['react/jsx-runtime'],'expo-router/react-navigation':pressable,
     'expo-haptics':{ImpactFeedbackStyle:{Light:'light'},impactAsync:value=>{feedback.push(value);return Promise.resolve();}},
   },{process:{env:{EXPO_OS:os}}});
   const style={backgroundColor:'transparent',borderRadius:18},ref={current:null};
   const tree=haptic.HapticTab({disabled,style,ref,href:'/(tabs)/activity',accessibilityLabel:'Activity',
     role:'tab','aria-selected':true,android_ripple:{color:'black',borderless:true},pressOpacity:0.3,
     children:'Existing icon and label',onPressIn:()=>events.push('in'),onPressOut:()=>events.push('out'),
     onPress:()=>events.push('navigate'),onLongPress:()=>events.push('long'),
   });
   assert.equal(tree.props.style[1],style);
   assert.equal(tree.props.ref,ref);
   assert.equal(tree.props.href,'/(tabs)/activity');
   assert.equal(tree.props.accessibilityLabel,'Activity');
   assert.equal(tree.props.role,'tab');assert.equal(tree.props['aria-selected'],true);
   assert.ok(tree.props.children.includes('Existing icon and label'));
   if(disabled){assert.equal(tree.props.onPress,undefined);assert.equal(tree.props.onPressIn,undefined);assert.equal(tree.props.android_ripple,undefined);}
   else{
     if(os==='android'){assert.equal(tree.props.android_ripple.color,'transparent');assert.equal(tree.props.android_ripple.borderless,false);}
     else assert.equal(tree.props.android_ripple,undefined);
     tree.props.onPressIn({});assert.ok(animatedValues.every(value=>value.value===1),'Pressing never lowers opacity');
     tree.props.onPress({});tree.props.onPressOut({});tree.props.onLongPress({});
     assert.equal(events.join(','),'in,navigate,out,long');
     assert.equal(feedback.length,os==='ios'?1:0,'Existing iOS haptics remain');
     assert.ok(animatedValues.every(value=>value.value===1),'Releasing keeps opacity stable');
   }
 }
 button(view(),'Edit Profile').props.onPress();nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='First Name').props.onChangeText('Changed');view();
 let prevented=0,moved=0;
 const guardedState={index:4,routes:['index','activity','points','status','profile'].map(name=>({name,key:name}))};
 const guardedPress=tabProps.screenListeners({navigation:{getState:()=>guardedState,navigate:()=>{moved++;guardedState.index=1;}},route:{name:'activity'}}).tabPress;
 guardedPress({preventDefault:()=>prevented++});
 assert.equal(prevented,1);assert.equal(moved,0);nodes(view()).find(n=>n.type==='ConfirmationModal').props.onSecondary();
 assert.equal(tabProps.tabBar({state:guardedState}).props.state.index,4,'Cancelling the Profile guard leaves the pill on the actual Profile route');
 assert.equal(moved,0);guardedPress({preventDefault:()=>prevented++});
 nodes(view()).find(n=>n.type==='ConfirmationModal').props.onPrimary();assert.equal(moved,1);
 assert.equal(tabProps.tabBar({state:guardedState}).props.state.index,1,'Only committed navigation moves the pill');view();
 const mh=host();let confirmed=0,cancelled=0,dismissible=true,dismissOnBackdrop=false;const confirmationPending=deferred();
 const modalComponent=load('src/components/confirmation-modal.tsx',{...shared,react:mh.react,'react-native':{...native,Modal:'Modal',ActivityIndicator:'Spinner'}});
 const modalView=()=>mh.render(()=>modalComponent.ConfirmationModal({visible:true,title:'Discard changes?',message:'Unsaved changes',primaryLabel:'Discard',variant:'destructive',dismissible,dismissOnBackdrop,onSecondary(){cancelled++;},onPrimary:()=>{confirmed++;return confirmationPending.promise;}}));
 const modalButtons=()=>nodes(modalView()).filter(n=>n.type==='Pressable');
 assert.equal(modalButtons().map(n=>n.props.accessibilityLabel).join(','),'Cancel,Discard');
 assert.ok(nodes(modalView()).some(n=>n.type==='SafeAreaView'&&n.props.edges.join(',')==='top,bottom'));
 assert.ok(nodes(modalView()).some(n=>n.props?.accessibilityViewIsModal&&n.props.style.backgroundColor==='#FFF9F2'&&n.props.style.maxHeight==='100%'));
 assert.ok(nodes(modalView()).some(n=>n.type==='ScrollView'));
 assert.ok(modalButtons().every(n=>n.props.style[0].minHeight>=48));
 const primary=()=>nodes(modalView()).find(n=>n.props?.accessibilityLabel==='Discard');primary().props.onPress();primary().props.onPress();
 assert.equal(confirmed,1);assert.equal(primary().props.disabled,true);assert.ok(!nodes(modalView()).some(n=>n.type==='Image'));
 nodes(modalView()).find(n=>n.type==='Modal').props.onRequestClose();assert.equal(cancelled,0,'Busy confirmations cannot dismiss');
 confirmationPending.resolve();await flush();assert.equal(primary().props.disabled,false);
 dismissible=false;nodes(modalView()).find(n=>n.type==='Modal').props.onRequestClose();assert.equal(cancelled,0,'Original non-dismissable native dialog semantics remain');
 dismissible=true;nodes(modalView()).find(n=>n.type==='Modal').props.onRequestClose();assert.equal(cancelled,1);
 dismissOnBackdrop=true;nodes(modalView()).find(n=>n.type==='Pressable'&&n.props.style?.position==='absolute').props.onPress();assert.equal(cancelled,2,'Cancelable native backdrop dismissal uses the same secondary action');

 // Profile Phase 2: existing Profile entry and separate Help/Logout remain.
 button(view(),'Profile Settings').props.onPress();assert.equal(routes.pop(),'/profile-settings');
 assert.ok(button(view(),'About LifeFlow'));assert.ok(button(view(),'Logout'));
 let logouts=0;auth.logout=async()=>{logouts++;};
 const logoutModal=()=>nodes(view()).find(n=>n.type==='ConfirmationModal'&&n.props.title==='Log out?').props;
 button(view(),'Logout').props.onPress();assert.equal(logouts,0);assert.equal(logoutModal().visible,true);
 assert.equal(logoutModal().secondaryLabel,'Cancel');assert.equal(logoutModal().primaryLabel,'Logout');assert.equal(logoutModal().dismissible,false);
 logoutModal().onSecondary();assert.equal(logouts,0);assert.equal(logoutModal().visible,false);
 button(view(),'Logout').props.onPress();await logoutModal().onPrimary();assert.equal(logouts,1);assert.equal(routes.pop(),'/(auth)/login');
 const settings=load('src/constants/profile-settings.ts');
 assert.equal(Object.keys(settings.PROFILE_MASCOTS).length,5);
 let backAvailable=true,backs=0;
 const router={push:r=>routes.push(r),replace:r=>routes.push(r),canGoBack:()=>backAvailable,back:()=>{backs++;}};
 const page=load('src/components/profile-settings-page.tsx',{...shared,'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>router}});
 const menu=load('src/app/profile-settings.tsx',{'@/contexts/auth-context':{useAuth:()=>auth},...shared,'expo-router':{useRouter:()=>router},
 '@/components/profile-settings-page':page,'@/constants/profile-settings':settings});
 const tree=menu.default();
 for(const title of ['Profile Settings','ACCOUNT','Change Avatar','Change Email','PREFERENCES','Notification Settings'])assert.ok(texts(tree).includes(title),title);
 assert.ok(!texts(tree).includes('Change Password'));
 assert.ok(!texts(tree).includes('Logout'));assert.ok(!texts(tree).includes('Help / About'));
 const goBack=t=>nodes(t).find(n=>n.props?.accessibilityLabel==='Go back').props.onPress();
 goBack(tree);assert.equal(backs,1);backAvailable=false;goBack(tree);assert.equal(routes.pop(),'/(tabs)/profile');
 for(const item of settings.ACCOUNT_SETTINGS){
   button(tree,item.title).props.onPress();const route=routes.pop();
   assert.equal(route.pathname,'/profile-settings/[setting]');assert.equal(route.params.setting,item.key);
 }
 button(tree,'Notification Settings').props.onPress();assert.equal(routes.pop(),'/notifications');
 let setting='avatar';
 const preview=load('src/app/profile-settings/[setting].tsx',{'@/components/profile-mascot-selector':{ProfileMascotSelector:'ProfileMascotSelector'},'@/contexts/auth-context':{useAuth:()=>auth},'@/components/account-settings-forms':{ChangeEmailForm:'ChangeEmailForm',ChangePasswordForm:'ChangePasswordForm'},...shared,'expo-router':{useLocalSearchParams:()=>({setting})},
 '@/components/profile-settings-page':page,'@/constants/profile-settings':settings});
 const writesBefore=saves,requestsBefore=requests.length;
 for(setting of ['avatar','email']){
   const t=preview.default();if(setting==='avatar')assert.ok(nodes(t).some(n=>n.type==='ProfileMascotSelector'));else assert.ok(nodes(t).some(n=>n.type===(setting==='email'?'ChangeEmailForm':'ChangePasswordForm')));
   assert.equal(nodes(t).filter(n=>n.type==='TextInput').length,0);
   assert.equal(nodes(t).filter(n=>n.type==='Image').length,0);
   goBack(t);assert.equal(routes.pop(),'/profile-settings');
 }
 for(setting of ['password','unknown','__proto__',['avatar']])assert.ok(texts(preview.default()).includes('This setting is not available.'));
 assert.equal(saves,writesBefore);assert.equal(requests.length,requestsBefore);
 const layout=fs.readFileSync('src/app/_layout.tsx','utf8');
 const protectedRoutes=layout.slice(layout.indexOf('<Stack.Protected guard={!!user}>'),layout.indexOf('</Stack.Protected>',layout.indexOf('<Stack.Protected guard={!!user}>')));
 assert.ok(protectedRoutes.includes('name="profile-settings"'));assert.ok(protectedRoutes.includes('name="profile-settings/[setting]"'));


 // Real Phase 3 form handlers; no network or native permission boundary is available here.
 const apiErrors=load('src/services/api.ts',{}, {process:{env:{}}});
 const timers=new Set();let now=100000;
 const formAuth={user:{id:1,email:'old@example.test',email_verified_at:'2026-09-14'},profile:{mobile_number:'09171234567'},busy:false};
 let starts=0,verifications=0,resends=0,passwordChanges=0,finish=deferred();
 let currentRequests=0,currentConfirms=0;
 formAuth.requestLoginCode=async()=>{currentRequests++;return {resend_after:60,expires_in:600};};
 formAuth.confirmEmailLogin=async(mobile,code)=>{currentConfirms++;assert.equal(mobile,'09171234567');assert.equal(code,'123456');};
 formAuth.requestEmailChange=async(email)=>{starts++;assert.equal(email,'new@example.test');return finish.promise;};
 formAuth.verifyEmailChange=async()=>{verifications++;formAuth.user={...formAuth.user,email:'new@example.test'};};
 formAuth.resendEmailChange=async()=>{resends++;return {resend_after:60,expires_in:900};};
 formAuth.changePassword=async()=>{passwordChanges++;return finish.promise;};
 function formHarness(name){
  const state=host();
  const forms=load('src/components/account-settings-forms.tsx',{...shared,react:state.react,'expo-router':{useRouter:()=>router},
    '@/contexts/auth-context':{useAuth:()=>formAuth},'@/services/api':apiErrors},
    {Date:{now:()=>now},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
  return {state,view:()=>state.render(forms[name])};
 }
 const emailForm=formHarness('ChangeEmailForm');
 const setField=(tree,label,value)=>nodes(tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label).props.onChangeText(value);
 assert.ok(texts(emailForm.view()).includes('old@example.test'));
 assert.equal(button(emailForm.view(),'Send Current Email Code').props.disabled,true);
 assert.ok(!nodes(emailForm.view()).some(n=>n.props?.secureTextEntry));
 setField(emailForm.view(),'New Email','new@example.test');
 const send=button(emailForm.view(),'Send Current Email Code');send.props.onPress();send.props.onPress();await flush();assert.equal(currentRequests,1);
 assert.equal(button(emailForm.view(),'Resend code in 60s').props.disabled,true);
 setField(emailForm.view(),'Current email code','123456');const confirm=button(emailForm.view(),'Confirm & Send New Email Code');confirm.props.onPress();confirm.props.onPress();await flush();assert.equal(currentConfirms,1);assert.equal(starts,1);
 finish.reject(new apiErrors.ApiError('Choose an unused email.',422,{new_email:['Choose an unused email.']}));await flush();assert.ok(texts(emailForm.view()).includes('Choose an unused email.'));
 finish=deferred();button(emailForm.view(),'Confirm & Send New Email Code').props.onPress();await flush();assert.equal(currentConfirms,1);assert.equal(starts,2);
 finish.resolve({pending_token:'opaque',resend_after:60,expires_in:900});await flush();
 assert.ok(texts(emailForm.view()).includes('Verify New Email'));assert.ok(texts(emailForm.view()).includes('Resend code in 60s'));
 now+=61000;for(const timer of timers)timer();button(emailForm.view(),'Resend code').props.onPress();await flush();assert.equal(resends,1);
 setField(emailForm.view(),'Verification code','123456');
 button(emailForm.view(),'Verify & Change Email').props.onPress();await flush();
 assert.ok(texts(emailForm.view()).includes('Email changed successfully.'));button(emailForm.view(),'Back to Profile Settings').props.onPress();assert.equal(routes.pop(),'/profile-settings');
 emailForm.state.unmount();assert.equal(timers.size,0);
 const passwordForm=formHarness('ChangePasswordForm');
 setField(passwordForm.view(),'Current Password','password123');setField(passwordForm.view(),'New Password','newPassword123');setField(passwordForm.view(),'Confirm New Password','mismatch');
 assert.equal(button(passwordForm.view(),'Change Password').props.disabled,true);
 const visibility=nodes(passwordForm.view()).find(n=>n.props?.accessibilityLabel==='Show current password');visibility.props.onPress();
 assert.equal(nodes(passwordForm.view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Current Password').props.secureTextEntry,false);
 setField(passwordForm.view(),'Confirm New Password','newPassword123');finish=deferred();
 const change=button(passwordForm.view(),'Change Password');change.props.onPress();change.props.onPress();assert.equal(passwordChanges,1);
 finish.reject(new apiErrors.ApiError('Current password incorrect',422,{current_password:['Current password incorrect']}));await flush();assert.ok(texts(passwordForm.view()).includes('Current password incorrect'));
 assert.equal(nodes(passwordForm.view()).find(n=>n.type==='TextInput').props.value,'');
 setField(passwordForm.view(),'Current Password','password123');setField(passwordForm.view(),'New Password','newPassword123');setField(passwordForm.view(),'Confirm New Password','newPassword123');finish=deferred();
 button(passwordForm.view(),'Change Password').props.onPress();finish.resolve({message:'Password updated successfully.'});await flush();
 assert.ok(texts(passwordForm.view()).includes('Password updated successfully.'));passwordForm.state.unmount();
 // Payloads are explicit and use the private bearer token.
 await service.authApi.requestEmailChange('private','NEW@example.test');
 assert.equal(requests.at(-1).options.body.new_email,'new@example.test');
 await service.authApi.verifyEmailChange('private','opaque','123456');
 assert.deepEqual(Object.keys(requests.at(-1).options.body).sort(),['code','pending_token']);
 await service.authApi.resendEmailChange('private','opaque');assert.equal(requests.at(-1).options.token,'private');
 await service.authApi.changePassword('private','current','new-password','new-password');
 assert.deepEqual(Object.keys(requests.at(-1).options.body).sort(),['current_password','password','password_confirmation']);


 // Five independent persisted identifiers, with one temporary local artwork.
 assert.deepEqual(Object.keys(settings.PROFILE_MASCOTS),['mascot_1','mascot_2','mascot_3','mascot_4','mascot_5']);
 for(const value of [undefined,null,'default','mascot_6','__proto__','constructor','https://bad.test/image.png',{}]){
   assert.equal(settings.profileMascotKey(value),'mascot_1');
   assert.equal(settings.profileMascotImage(value),settings.PROFILE_MASCOTS.mascot_1);
 }
 for(const key of Object.keys(settings.PROFILE_MASCOTS))assert.equal(settings.profileMascotKey(key),key);
 const avatarHost=host();let avatarWrites=0,avatarPending=deferred();
 const avatarAuth={profile:{...auth.profile,profile_avatar:'mascot_3'},busy:false,loadProfile:async()=>{},
   saveAvatar:async key=>{avatarWrites++;assert.equal(key,'mascot_5');await avatarPending.promise;avatarAuth.profile={...avatarAuth.profile,profile_avatar:key};}};
 const avatar=load('src/components/profile-mascot-selector.tsx',{...shared,react:avatarHost.react,
   'expo-router':{useFocusEffect:avatarHost.focus},'@/contexts/auth-context':{useAuth:()=>avatarAuth},
   '@/services/api':{errorMessage:e=>e.message},'@/constants/profile-settings':settings});
 const avatarView=()=>avatarHost.render(avatar.ProfileMascotSelector);
 avatarView();await flush();
 const choices=()=>nodes(avatarView()).filter(n=>n.props?.accessibilityRole==='radio');
 assert.equal(choices().length,5);assert.equal(new Set(choices().map(n=>n.props.accessibilityLabel)).size,5);
 assert.equal(choices()[2].props.accessibilityState.checked,true);assert.equal(button(avatarView(),'Save Avatar').props.disabled,true);
 choices()[4].props.onPress();assert.equal(button(avatarView(),'Save Avatar').props.disabled,false);
 const avatarSave=button(avatarView(),'Save Avatar');avatarSave.props.onPress();avatarSave.props.onPress();
 assert.equal(avatarWrites,1);assert.ok(!texts(avatarView()).includes('Avatar saved.'));
 avatarPending.resolve();await flush();assert.ok(texts(avatarView()).includes('Avatar saved.'));
 assert.equal(avatarAuth.profile.profile_avatar,'mascot_5');assert.equal(choices()[4].props.accessibilityState.checked,true);
 await service.authApi.saveAvatar('private','mascot_5');assert.equal(requests.at(-1).path,'/donor-profile/avatar');
 assert.equal(requests.at(-1).options.method,'PUT');assert.deepEqual(Object.keys(requests.at(-1).options.body),['profile_avatar']);
 assert.equal(requests.at(-1).options.body.profile_avatar,'mascot_5');
 avatarAuth.saveAvatar=async()=>{throw Error('Offline');};
 choices()[0].props.onPress();button(avatarView(),'Save Avatar').props.onPress();await flush();
 assert.ok(texts(avatarView()).includes('Offline'));assert.ok(!texts(avatarView()).includes('Avatar saved.'));
 assert.equal(choices()[4].props.accessibilityState.checked,true);
 avatarHost.unmount();


 // Help/About reuses the existing legal reader in read-only mode.
 button(view(),'About LifeFlow').props.onPress();assert.equal(routes.pop(),'/help-about');
 const legal=load('src/components/registration-legal.tsx',{...shared,'react-native':{...native,Modal:'Modal'}});
 const helpHost=host();
 const help=load('src/app/help-about.tsx',{...shared,react:helpHost.react,
 'expo-constants':{__esModule:true,default:{expoConfig:JSON.parse(fs.readFileSync('app.json','utf8')).expo}},
 '@/components/profile-settings-page':page,'@/components/registration-legal':legal});
 const helpView=()=>helpHost.render(help.default);
 const headings=['About LifeFlow','How LifeFlow Works','Frequently Asked Questions','Donation Disclaimer','Terms and Conditions','Privacy Policy','Contact / Support','Meet the Developers','LifeFlow Development Team','App Version'];
 let previous=-1;const helpText=texts(helpView());for(const heading of headings){const index=helpText.indexOf(heading,previous+1);assert.ok(index>previous,heading);previous=index;}
 assert.ok(nodes(helpView()).some(n=>n.type==='ScrollView'));assert.ok(helpText.includes(JSON.parse(fs.readFileSync('app.json','utf8')).expo.version));
 const team=nodes(helpView()).find(n=>n.type==='View'&&Array.isArray(n.props.children)&&n.props.children.some(child=>child?.type==='Text'&&child.props.children==='LifeFlow Development Team'));
 assert.ok(team);assert.deepEqual(nodes(team).filter(n=>n.type==='Text').map(n=>n.props.children),['LifeFlow Development Team','Name','Name','Name']);
 assert.ok(helpText.includes('LifeFlow is a capstone project supporting blood donation awareness and donor engagement.'));
 assert.ok(nodes(helpView()).some(n=>n.type==='Icon'&&n.props.name==='groups'&&n.props.accessible===false));
 assert.equal(nodes(team).filter(n=>['Pressable','Image','TextInput'].includes(n.type)).length,0,'Credits are static text without portraits, links or controls');
 assert.ok(nodes(team).filter(n=>n.type==='Text').every(n=>n.props.allowFontScaling!==false&&!n.props.numberOfLines),'Names can wrap and retain accessibility text scaling');
 assert.equal(team.props.style.height,undefined,'The team card grows with text instead of clipping names');
 goBack(helpView());assert.equal(routes.pop(),'/(tabs)/profile');
 for(const [title,key] of [['Terms and Conditions','terms'],['Privacy Policy','privacy']]){
   button(helpView(),title).props.onPress();const modal=nodes(helpView()).find(n=>n.type==='Modal');
   assert.equal(modal.props.visible,true);assert.ok(texts(modal).includes(legal.LEGAL_DOCUMENTS[key].sections[0][1]));
   assert.equal(button(modal,'I Agree'),undefined);assert.equal(button(modal,'Cancel'),undefined);
   nodes(modal).find(n=>n.props?.accessibilityLabel==='Back to About LifeFlow').props.onPress();
   assert.equal(nodes(helpView()).find(n=>n.type==='Modal').props.visible,false);
 }
 helpHost.unmount();

 // Actual top-screen/modal headers have no divider; content separators remain.
 const topHeaders={
   'src/app/(tabs)/index.tsx':'fixedHeader','src/app/(tabs)/activity.tsx':'fixedHeader','src/app/(tabs)/points.tsx':'fixedHeader','src/app/(tabs)/status.tsx':'fixedHeader','src/app/(tabs)/profile.tsx':'fixedHeader',
   'src/app/activity/[id].tsx':'header','src/app/announcement/[id].tsx':'header','src/app/announcements.tsx':'header','src/app/evaluation.tsx':'header',
   'src/app/my-vouchers.tsx':'fixedHeader','src/app/notifications.tsx':'fixedHeader','src/app/redeem.tsx':'fixedHeader','src/app/voucher.tsx':'fixedHeader',
   'src/components/profile-settings-page.tsx':'header','src/components/flowie-conversation-screen.tsx':'header','src/components/flowie-history-screen.tsx':'header',
   'src/components/reward-details-modal.tsx':'header','src/components/did-you-know.tsx':'sheetHeader',
 };
 for(const [file,key] of Object.entries(topHeaders)){
   const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);let header;
   function inspect(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='StyleSheet.create')header=n.arguments[0].properties.find(p=>p.name.getText(ast)===key)?.initializer;ts.forEachChild(n,inspect);}inspect(ast);
   assert.ok(header,file);assert.ok(!header.properties.some(p=>['borderBottomWidth','borderBottomColor'].includes(p.name.getText(ast))),file+': clean top header');
 }
 for(const [file,key,property] of [['src/app/(tabs)/profile.tsx','informationRowBorder','borderBottomWidth'],['src/components/flowie-conversation-screen.tsx','composerBorder','borderTopWidth'],['src/app/activity/[id].tsx','about','borderTopWidth']]){
   const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);let divider;
   function inspect(n){if(ts.isPropertyAssignment(n)&&n.name.getText(ast)===key&&ts.isObjectLiteralExpression(n.initializer))divider=n.initializer.properties.find(p=>p.name.getText(ast)===property)?.initializer.getText(ast);ts.forEachChild(n,inspect);}inspect(ast);assert.equal(divider,'1',file+': meaningful content divider retained');
 }

 // Execute the shared scene decoration, preserving the child identity and tab clearance.
 const content = { type: 'TabContent', props: {} };
 const background = tabProps.screenLayout({ children: content });
 assert.equal(background.props.style.backgroundColor, '#FFF9F2');
 assert.equal(background.props.style.flex, 1);
 assert.equal(background.props.children[1], content);
 const decoration = background.props.children[0];
 assert.equal(decoration.props.pointerEvents, 'none');
 assert.equal(decoration.props.accessibilityElementsHidden, true);
 assert.equal(decoration.props.importantForAccessibility, 'no-hide-descendants');
 const decorationStyle = Object.assign({}, ...decoration.props.style);
 assert.equal(decorationStyle.position, 'absolute');
 assert.equal(decorationStyle.overflow, 'hidden');
 assert.equal(decorationStyle.top, tabTopInset);
 for (const edge of ['bottom', 'left', 'right']) assert.equal(decorationStyle[edge], 0);
 const [topCircle, bottomCircle] = decoration.props.children.map(child => child.props.style);
 assert.ok(topCircle.width + topCircle.right <= 110 && topCircle.height + topCircle.top <= 120);
 assert.ok(topCircle.opacity <= 0.35, 'Top-right arc must remain especially subtle');
 for (const inset of [0, 24, 44, 59]) {
   tabTopInset = inset; tabLayout.default();
   const scene = tabProps.screenLayout({ children: content });
   const layerStyle = Object.assign({}, ...scene.props.children[0].props.style);
   assert.equal(layerStyle.top, inset, 'Decoration cannot enter the top Safe Area');
   assert.equal(scene.props.style.backgroundColor, '#FFF9F2');
   assert.equal(scene.props.children[1], content);
 }
 for (const circle of [topCircle, bottomCircle]) {
   assert.equal(circle.position, 'absolute'); assert.equal(circle.width, circle.height);
   assert.equal(circle.borderRadius, circle.width / 2); assert.ok(circle.opacity <= 0.65);
   assert.ok(circle.backgroundColor.startsWith('rgba(255,202,208,'),'Background circles use subtle Pastel Pink alpha variants');
 }
 // At phone widths/heights both circles cross only their intended corner and stay mostly outside.
 for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
   assert.ok(topCircle.top < -topCircle.height / 2 && topCircle.right < -topCircle.width / 2);
   assert.ok(bottomCircle.bottom < -bottomCircle.height / 2 && bottomCircle.left < -bottomCircle.width / 2);
   assert.ok(topCircle.width + topCircle.right < width && topCircle.height + topCircle.top < height);
   assert.ok(bottomCircle.width + bottomCircle.left < width && bottomCircle.height + bottomCircle.bottom < height);
 }
 assert.ok(tabProps.screenOptions.sceneStyle.paddingBottom > tabProps.screenOptions.tabBarStyle[1].height);
 assert.equal(tabProps.screenOptions.tabBarStyle[0].backgroundColor, '#FFF9F2');

 // All real tab screens reset only their visual scroll refs after a blur/focus cycle.
 // The native methods and navigation lifecycle are mocked; device flicker is a manual acceptance check.
 const { host: focusHost } = require('./flowie-test-boundaries.cjs');
 for (const tab of ['index', 'activity', 'points', 'status', 'profile']) {
   const tabHost = focusHost();
   let reads = 0;
   const read = result => async () => { reads++; return result; };
   const stableAuth = { ...auth, loadProfile: read(undefined), opportunities: read({ data: [] }),
     donationHistory: read({ data: [], current_page: 1, last_page: 1, total: 0 }),
     pointsSummary: read({ current_balance: 650 }), pointTransactions: read({ data: [], current_page: 1, last_page: 1 }),
     donationSummary: read({ total_donations: 3, achievement: { label: 'Bronze Donor' } }) };
   const cooldown = { state: null, loading: false, error: '', canSubmit: false };
   const tabModule = load(`src/app/(tabs)/${tab}.tsx`, { ...shared, react: tabHost.react,
     'react-native': { ...native, FlatList: 'FlatList', AppState: { addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width: 360, fontScale: 1 }) },
     'expo-router': { useRouter: () => profileRouter, useFocusEffect: tabHost.focus },
     '@/contexts/auth-context': { useAuth: () => stableAuth },
     '@/contexts/tab-leave-context': { useTabLeave: () => tabGuard },
     '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
     '@/components/birth-date-picker': { __esModule: true, default: 'BirthDatePicker' },
     '@/components/notification-bell': { NotificationBell: 'Bell' },
     '@/components/home-donation-reminder': { HomeDonationReminder: 'Reminder' },
     '@/components/announcement-image': { AnnouncementImage: 'AnnouncementImage' },
     '@/components/did-you-know': { DidYouKnow: 'DidYouKnow' },
     '@/constants/profile-settings': settings, '@/constants/flowie-mascots': load('src/constants/flowie-mascots.ts'),
     '@/services/auth': service, '@/services/api': { errorMessage: error => error.message },
     '@/services/donations': { boardItems: () => [], DONATION_STATUS: {}, DONATION_STATUS_DESCRIPTION: {} },
     '@/services/announcement-presentation': {},
     '@/services/eligibility': { SCREENING_NOTICE: 'Notice' },
     '@/hooks/use-eligibility-cooldown': { useEligibilityCooldown: () => cooldown, formatEligibilityWait: () => '' },
   }, { setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {} });
   const tabView = () => tabHost.render(tabModule.default);
   tabView(); await flush();
   const tree = tabView();
   assert.equal(tree.type, 'SafeAreaView'); assert.equal(tree.props.edges.join(','), 'top');
   assert.equal(tree.props.style.backgroundColor, 'transparent');
   const header = nodes(tree).find(node => node.type === 'View' && node.props.style?.zIndex === 10);
   assert.equal(header.props.style.borderBottomWidth??0,0,`${tab}: no pink header divider`);
   assert.equal(header.props.style.backgroundColor, '#FFF9F2', `${tab}: opaque continuous header`);
   assert.equal(header.props.style.zIndex, 10);
   assert.equal(header.props.children.props.style.width, '100%');
   assert.equal(header.props.children.props.style.paddingVertical, 9);
   assert.equal(header.props.children.props.style.paddingHorizontal, 20);
   assert.equal(header.props.children.props.style.justifyContent, 'space-between');
   const scrollers = nodes(tree).filter(node => ['ScrollView', 'FlatList'].includes(node.type) && node.props.ref);
   assert.equal(scrollers.length, tab === 'points' ? 2 : 1, tab);
   const calls = [];
   scrollers.forEach((node, index) => {
     const run = options => calls.push({ index, options });
     node.props.ref.current = node.type === 'FlatList' ? { scrollToOffset: run } : { scrollTo: run };
   });
   const readsBeforeRenders = reads;
   // Same-focus rerenders and async completions must not reset the user's current position or refetch.
   tabView(); await flush(); tabView();
   assert.equal(calls.length, 0, tab); assert.equal(reads, readsBeforeRenders, tab);
   // Changing dependencies of an existing data refresh does not restart the independent scroll effect.
   if (tab === 'activity') {
     stableAuth.donationHistory = read({ data: [], current_page: 1, last_page: 1, total: 0 });
     tabView(); await flush(); tabView(); assert.equal(calls.length, 0);
   }
   if (tab === 'points') {
     const filter = nodes(tabView()).find(node => node.type === 'Pressable' && texts(node) === 'Earned');
     filter.props.onPress(); tabView(); await flush(); tabView(); assert.equal(calls.length, 0);
     // The existing keyed history scroller remounts for a new filter; attach its new native ref.
     const history = nodes(tabView()).find(node => node.props?.accessibilityLabel === 'Points history');
     history.props.ref.current = { scrollTo: options => calls.push({ index: 1, options }) };
   }
   const expectedReads = tab === 'index' ? 3 : tab === 'points' || tab === 'profile' ? 2 : tab === 'activity' ? 1 : 0;
   for (let cycle = 0; cycle < 2; cycle++) {
     const before = reads;
     tabHost.blur(); assert.equal(calls.length, cycle * scrollers.length, tab);
     tabHost.refocus(); await flush(); tabView();
     assert.equal(calls.length, (cycle + 1) * scrollers.length, tab);
     assert.equal(reads - before, expectedReads, `${tab}: preserve only existing focus refreshes`);
     for (const call of calls.slice(cycle * scrollers.length)) {
       assert.deepEqual(Object.keys(call.options).sort(), tab === 'activity' ? ['animated', 'offset'] : ['animated', 'y']);
       assert.equal(call.options.animated, false);
       assert.equal(tab === 'activity' ? call.options.offset : call.options.y, 0);
     }
     if (tab === 'points') assert.ok(texts(tabView()).includes('650'));
     tabView(); assert.equal(calls.length, (cycle + 1) * scrollers.length, tab);
   }
   if (tab === 'points') {
     const filter = nodes(tabView()).find(node => node.type === 'Pressable' && texts(node) === 'Earned');
     assert.equal(filter.props.style({ pressed: false })[1].backgroundColor, '#892325');
   }
   scrollers.forEach(node => { node.props.ref.current = null; });
   tabHost.blur(); tabHost.refocus(); await flush(); tabView();
   assert.equal(calls.length, 2 * scrollers.length, `${tab}: detached refs are safe`);
   tabHost.unmount();
 }
 h.unmount();console.log('Profile and tab UX checks passed: edits/leave guards/settings, five tab focus scroll resets including nested points history, preserved filters/data and existing refresh counts, shared noninteractive clipped pale background at small/medium/tall phone sizes, safe area and tab clearance.');
})().catch(e=>{console.error(e);process.exitCode=1;});

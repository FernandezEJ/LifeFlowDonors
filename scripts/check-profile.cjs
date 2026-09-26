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
const native={Platform:{OS:'android'},KeyboardAvoidingView:'KeyboardAvoidingView',View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',ScrollView:'ScrollView',TextInput:'TextInput',StyleSheet:{create:x=>x},Alert:{alert:()=>{throw Error('Unexpected validation alert');}}};
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
 const service=load('src/services/auth.ts',{'./api':{apiRequest:async(path,options)=>{requests.push({path,options});},ApiError:class extends Error{}}});
 const form={firstName:'Juan',middleName:'',lastName:'Cruz',email:'juan@example.com',mobileNumber:'09171234567',birthDate:'09/17/2004',gender:'Male',bloodType:'O+'};
 await service.authApi.updateProfile('private',form);
 assert.deepEqual(Object.keys(requests[0].options.body).sort(),['birth_date','blood_type','first_name','gender','last_name','middle_name','mobile_number']);
 assert.equal(requests[0].options.body.birth_date,'2004-09-17');assert.equal(service.toProfilePayload(form).email,form.email);
 const routes=[];const h=host();let saves=0,pending;
 const auth={user:{id:1,name:'Juan Cruz',email:form.email,email_verified_at:null},profile:service.toProfileUpdatePayload(form),busy:false,
 loadProfile:async()=>{},donationSummary:async()=>({total_donations:0,achievement:{label:'New Donor'}}),
 saveProfile:async draft=>{saves++;if(pending)await pending.promise;auth.profile=service.toProfileUpdatePayload(draft);},logout:async()=>{}};
 const screen=load('src/app/(tabs)/profile.tsx',{'@/constants/profile-settings':load('src/constants/profile-settings.ts'),...shared,react:h.react,'expo-router':{useRouter:()=>({replace:()=>{},push:r=>routes.push(r)}),useFocusEffect:h.focus},
 '@/components/birth-date-picker':{__esModule:true,default:'BirthDatePicker'},'@/components/notification-bell':{NotificationBell:'NotificationBell'},
 '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{errorMessage:e=>e.message},'@/services/auth':service});
 const view=()=>h.render(screen.default);view();await flush();
 for(const label of ['Profile Information','First Name','Middle Name','Last Name','Email','Mobile Number','Birth Date','Gender','Blood Type','Total Donations','Donor Achievement','Profile Settings'])assert.ok(texts(view()).includes(label),label);
 assert.ok(texts(view()).includes('--'));assert.ok(!texts(view()).includes('Verified'));
 auth.user.email_verified_at='2026-09-14T00:00:00Z';assert.ok(texts(view()).includes('Verified'));
 const edit=button(view(),'Edit Profile');const style=Object.assign({},...edit.props.style({pressed:false}));assert.equal(style.backgroundColor,undefined);assert.equal(style.alignItems,'flex-end');edit.props.onPress();
 assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,6);assert.ok(!nodes(view()).some(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Email'));assert.ok(texts(view()).includes('Change email in Profile Settings.'));
 nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='First Name').props.onChangeText('Ana');
 nodes(view()).find(n=>n.type==='BirthDatePicker').props.onChange('01/02/2000');
 pending=deferred();const save=button(view(),'Save Profile');save.props.onPress();save.props.onPress();assert.equal(saves,1);
 pending.resolve();await flush();assert.equal(auth.profile.first_name,'Ana');assert.equal(auth.profile.birth_date,'2000-01-02');assert.ok(texts(view()).includes('Profile saved.'));
 button(view(),'Edit Profile').props.onPress();button(view(),'Cancel').props.onPress();assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,0);

 // Profile Phase 2: existing Profile entry and separate Help/Logout remain.
 button(view(),'Profile Settings').props.onPress();assert.equal(routes.pop(),'/profile-settings');
 assert.ok(button(view(),'Help / About LifeFlow'));assert.ok(button(view(),'Logout'));
 const settings=load('src/constants/profile-settings.ts');
 assert.equal(Object.keys(settings.PROFILE_MASCOTS).length,5);
 let backAvailable=true,backs=0;
 const router={push:r=>routes.push(r),replace:r=>routes.push(r),canGoBack:()=>backAvailable,back:()=>{backs++;}};
 const page=load('src/components/profile-settings-page.tsx',{...shared,'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>router}});
 const menu=load('src/app/profile-settings.tsx',{'@/contexts/auth-context':{useAuth:()=>auth},...shared,'expo-router':{useRouter:()=>router},
 '@/components/profile-settings-page':page,'@/constants/profile-settings':settings});
 const tree=menu.default();
 for(const title of ['Profile Settings','ACCOUNT','Change Avatar','Change Email','Change Password','PREFERENCES','Notification Settings'])assert.ok(texts(tree).includes(title),title);
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
 for(setting of ['avatar','email','password']){
   const t=preview.default();if(setting==='avatar')assert.ok(nodes(t).some(n=>n.type==='ProfileMascotSelector'));else assert.ok(nodes(t).some(n=>n.type===(setting==='email'?'ChangeEmailForm':'ChangePasswordForm')));
   assert.equal(nodes(t).filter(n=>n.type==='TextInput').length,0);
   assert.equal(nodes(t).filter(n=>n.type==='Image').length,0);
   goBack(t);assert.equal(routes.pop(),'/profile-settings');
 }
 for(setting of ['unknown','__proto__',['avatar']])assert.ok(texts(preview.default()).includes('This setting is not available.'));
 assert.equal(saves,writesBefore);assert.equal(requests.length,requestsBefore);
 const layout=fs.readFileSync('src/app/_layout.tsx','utf8');
 const protectedRoutes=layout.slice(layout.indexOf('<Stack.Protected guard={!!user}>'),layout.indexOf('</Stack.Protected>',layout.indexOf('<Stack.Protected guard={!!user}>')));
 assert.ok(protectedRoutes.includes('name="profile-settings"'));assert.ok(protectedRoutes.includes('name="profile-settings/[setting]"'));


 // Real Phase 3 form handlers; no network or native permission boundary is available here.
 const apiErrors=load('src/services/api.ts',{}, {process:{env:{}}});
 const timers=new Set();let now=100000;
 const formAuth={user:{id:1,email:'old@example.test',email_verified_at:'2026-09-14'},busy:false};
 let starts=0,verifications=0,resends=0,passwordChanges=0,finish=deferred();
 formAuth.requestEmailChange=async(password,email)=>{starts++;assert.equal(password,'password123');assert.equal(email,'new@example.test');return finish.promise;};
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
 assert.equal(button(emailForm.view(),'Send Verification Code').props.disabled,true);
 setField(emailForm.view(),'Current Password','password123');setField(emailForm.view(),'New Email','new@example.test');
 const send=button(emailForm.view(),'Send Verification Code');send.props.onPress();send.props.onPress();assert.equal(starts,1);
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
 await service.authApi.requestEmailChange('private','current','NEW@example.test');
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
 button(view(),'Help / About LifeFlow').props.onPress();assert.equal(routes.pop(),'/help-about');
 const legal=load('src/components/registration-legal.tsx',{...shared,'react-native':{...native,Modal:'Modal'}});
 const helpHost=host();
 const help=load('src/app/help-about.tsx',{...shared,react:helpHost.react,
 'expo-constants':{__esModule:true,default:{expoConfig:JSON.parse(fs.readFileSync('app.json','utf8')).expo}},
 '@/components/profile-settings-page':page,'@/components/registration-legal':legal});
 const helpView=()=>helpHost.render(help.default);
 const headings=['About LifeFlow','How LifeFlow Works','Frequently Asked Questions','Donation Disclaimer','Terms and Conditions','Privacy Policy','Contact / Support','App Version'];
 let previous=-1;const helpText=texts(helpView());for(const heading of headings){const index=helpText.indexOf(heading,previous+1);assert.ok(index>previous,heading);previous=index;}
 assert.ok(nodes(helpView()).some(n=>n.type==='ScrollView'));assert.ok(helpText.includes(JSON.parse(fs.readFileSync('app.json','utf8')).expo.version));
 goBack(helpView());assert.equal(routes.pop(),'/(tabs)/profile');
 for(const [title,key] of [['Terms and Conditions','terms'],['Privacy Policy','privacy']]){
   button(helpView(),title).props.onPress();const modal=nodes(helpView()).find(n=>n.type==='Modal');
   assert.equal(modal.props.visible,true);assert.ok(texts(modal).includes(legal.LEGAL_DOCUMENTS[key].sections[0][1]));
   assert.equal(button(modal,'I Agree'),undefined);assert.equal(button(modal,'Cancel'),undefined);
   nodes(modal).find(n=>n.props?.accessibilityLabel==='Back to Help / About LifeFlow').props.onPress();
   assert.equal(nodes(helpView()).find(n=>n.type==='Modal').props.visible,false);
 }
 helpHost.unmount();

 h.unmount();console.log('Profile Phase 1, 2 and 3 checks passed: edits, private payload, settings navigation, previews, back, mascot assets, and protected routes.');
})().catch(e=>{console.error(e);process.exitCode=1;});

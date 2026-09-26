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
 const api=load('src/services/api.ts',{}, {process:{env:{}},AbortController,setTimeout,clearTimeout});
 const requests=[],authService=load('src/services/auth.ts',{'./api':{...api,apiRequest:async(path,options)=>{requests.push({path,options});return {};}}});
 const fixture={acceptedTerms:true,acknowledgedPrivacy:true,acknowledgedPrescreening:true,firstName:'Test',middleName:'',lastName:'Donor',email:'new@example.com',mobileNumber:'09171234567',birthDate:'09/13/2004',gender:'Female',bloodType:'O+',password:'password123',confirmPassword:'password123'};
 await authService.authApi.register(fixture);
 assert.equal(requests[0].path,'/register/request-verification');assert.equal(requests[0].options.body.birth_date,'2004-09-13');assert.equal(requests[0].options.body.accepted_terms,true);assert.equal(requests[0].options.body.acknowledged_privacy,true);assert.equal(requests[0].options.body.acknowledged_prescreening,true);assert.equal(requests[0].options.token,undefined);
 await authService.authApi.verifyRegistration('pending','012345');assert.deepEqual(JSON.parse(JSON.stringify(requests[1].options.body)),{pending_token:'pending',code:'012345'});
 await authService.authApi.resendRegistration('pending');assert.deepEqual(JSON.parse(JSON.stringify(requests[2].options.body)),{pending_token:'pending'});
 const legal=load('src/components/registration-legal.tsx',shared);
 native.KeyboardAvoidingView='KeyboardAvoidingView';native.Modal='Modal';native.Platform={OS:'android'};
 // Native picker uses calendar days, preserves Cancel and rejects future selections.
 const dh=host();let pickerOptions,selected='09/13/2004';
 const picker=load('src/components/birth-date-picker.tsx',{...shared,react:dh.react,'@react-native-community/datetimepicker':{__esModule:true,default:'DateTimePicker',DateTimePickerAndroid:{open:options=>{pickerOptions=options;}}}});
 const dateView=()=>dh.render(()=>picker.default({value:selected,onChange:v=>{selected=v;}}));
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 assert.equal(pickerOptions.mode,'date');assert.equal(pickerOptions.display,'calendar');
 assert.ok(pickerOptions.maximumDate < new Date());
 pickerOptions.onChange({type:'dismissed'},new Date(2001,1,1));assert.equal(selected,'09/13/2004');
 pickerOptions.onChange({type:'set'},new Date(2099,1,1));assert.equal(selected,'09/13/2004');
 pickerOptions.onChange({type:'set'},new Date(2000,1,29));assert.equal(selected,'02/29/2000');
 assert.equal(nodes(dateView()).filter(n=>n.type==='TextInput').length,0);
 native.Platform.OS='ios';
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 const change=()=>nodes(dateView()).find(n=>n.type==='DateTimePicker').props.onChange;
 change()({},new Date(2001,2,15));button(dateView(),'Cancel').props.onPress();assert.equal(selected,'02/29/2000');
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 change()({},new Date(2001,2,15));button(dateView(),'Confirm').props.onPress();assert.equal(selected,'03/15/2001');
 assert.equal(nodes(dateView()).find(n=>n.type==='DateTimePicker').props.display,'spinner');
 // Browser fallback keeps draft dates separate until confirmed.
 const wh=host(),web=load('src/components/birth-date-picker.web.tsx',{...shared,react:wh.react});
 const wv=()=>wh.render(()=>web.default({value:selected,onChange:v=>{selected=v;}}));
 nodes(wv()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 nodes(wv()).find(n=>n.type==='input').props.onChange({target:{value:'2099-01-01'}});
 assert.equal(button(wv(),'Confirm').props.disabled,true);
 nodes(wv()).find(n=>n.type==='input').props.onChange({target:{value:'2004-09-13'}});
 button(wv(),'Cancel').props.onPress();assert.equal(selected,'03/15/2001');
 nodes(wv()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 nodes(wv()).find(n=>n.type==='input').props.onChange({target:{value:'2004-09-13'}});
 button(wv(),'Confirm').props.onPress();assert.equal(selected,'09/13/2004');
 // Register screen keeps existing fields and does not accept a session before verification.
 const h=host(),timers=new Set();let clock=0,createCalls=0,verifyCalls=0,resendCalls=0,payload,accepted=false;
 let initial=deferred(),verify=deferred(),resend=async()=>({});
 const auth={busy:false,register:form=>{createCalls++;payload=form;return initial.promise;},verifyRegistration:async(token,code)=>{verifyCalls++;assert.equal(token,'pending-test');assert.equal(code,'123456');await verify.promise;accepted=true;}};
 const screen=load('src/app/(auth)/register.tsx',{...shared,react:h.react,'expo-router':{useRouter:()=>({push:()=>{},replace:()=>{}}),useFocusEffect:h.focus},
 '@/components/registration-legal':legal,'@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':api,'@/services/auth':{...authService,authApi:{resendRegistration:()=>{resendCalls++;return resend();}}},
 '@/components/birth-date-picker':{__esModule:true,default:'BirthDatePicker'}},
 {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
 const view=()=>h.render(screen.default);
 assert.match(texts(view()),/Create Your Account/);
 for(const name of ['First Name','Middle Name','Last Name','Email Address','Mobile Number','Password','Confirm Password','Birth Date','Gender','Blood Type'])assert.ok(texts(view()).includes(name));
 const input=(placeholder,value)=>nodes(view()).find(n=>n.type==='TextInput'&&n.props.placeholder===placeholder).props.onChangeText(value);
 input('Enter your first name','Test');input('Enter your last name','Donor');input('Enter your email','new@example.com');input('09XXXXXXXXX','09171234567');
 input('Create a password','password123');input('Confirm your password','password123');
 nodes(view()).find(n=>n.type==='BirthDatePicker').props.onChange('09/13/2004');
 button(view(),'Female').props.onPress();button(view(),'O+').props.onPress();
 assert.equal(button(view(),'Create Account').props.disabled,true);
 const boxes=()=>nodes(view()).filter(n=>n.props?.accessibilityRole==='checkbox');
 assert.equal(boxes().length,3);
 const openLegal=label=>nodes(view()).find(n=>n.props?.accessibilityRole==='link'&&n.props.accessibilityLabel===label).props.onPress();
 const modal=()=>nodes(view()).find(n=>n.type==='Modal'&&n.props.visible);
 assert.ok(nodes(view()).some(n=>n.type==='View'&&n.props.style?.marginTop===16&&n.props.style?.gap===0));
 for(const [index,label] of ['Terms and Conditions','Privacy Policy'].entries()){
   const currentTree=view();
   const link=nodes(currentTree).find(n=>n.props?.accessibilityRole==='link'&&n.props.accessibilityLabel===label);
   assert.equal(link.type,'Text');
   assert.ok(nodes(currentTree).some(n=>n.type==='Text'&&n!==link&&nodes(n).includes(link)));
   assert.ok(!nodes(nodes(currentTree).filter(n=>n.props?.accessibilityRole==='checkbox')[index]).includes(link),'Link must not be inside checkbox press target');
   assert.equal(boxes()[index].props.style.minHeight,44);
   openLegal(label);assert.equal(boxes()[index].props.accessibilityState.checked,false);
   assert.ok(nodes(modal()).some(n=>n.type==='ScrollView'));assert.ok(texts(modal()).includes(label));
   assert.match(texts(modal()),/Version/);
   button(modal(),'Cancel').props.onPress();assert.equal(modal(),undefined);
   assert.equal(boxes()[index].props.accessibilityState.checked,false);
   openLegal(label);button(modal(),'I Agree').props.onPress();assert.equal(modal(),undefined);
   assert.equal(boxes()[index].props.accessibilityState.checked,true);
   assert.equal(boxes()[2].props.accessibilityState.checked,false);
   assert.equal(button(view(),'Create Account').props.disabled,true);
   openLegal(label);button(modal(),'Cancel').props.onPress();
   assert.equal(boxes()[index].props.accessibilityState.checked,true);
   openLegal(label);nodes(modal()).find(n=>n.props?.accessibilityLabel==='Back to registration').props.onPress();
   assert.equal(boxes()[index].props.accessibilityState.checked,true);
   openLegal(label);modal().props.onRequestClose();assert.equal(boxes()[index].props.accessibilityState.checked,true);
   assert.equal(nodes(view()).find(n=>n.props?.placeholder==='Create a password').props.value,'password123');
 }
 boxes()[2].props.onPress();assert.equal(button(view(),'Create Account').props.disabled,false);
 boxes()[0].props.onPress();assert.equal(button(view(),'Create Account').props.disabled,true);boxes()[0].props.onPress();
 const actionTree=view();
 const actionArea=nodes(actionTree).find(n=>n.type==='View'&&Array.isArray(n.props.style)&&n.props.style.some(style=>style?.marginTop===12&&style?.gap===10));
 assert.ok(actionArea);assert.ok(nodes(actionArea).includes(button(actionTree,'Create Account')));
 const submit=button(view(),'Create Account').props.onPress;submit();submit();assert.equal(createCalls,1);assert.equal(accepted,false);assert.equal(payload.birthDate,'09/13/2004');assert.equal(payload.acceptedTerms,true);assert.equal(payload.acknowledgedPrivacy,true);assert.equal(payload.acknowledgedPrescreening,true);
 initial.resolve({pending_token:'pending-test',resend_after:60,expires_in:900});await flush();
 assert.match(texts(view()),/Verify your email/);assert.equal(accepted,false);assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,1);
 const codeInput=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='6-digit code');
 codeInput().props.onChangeText('12345');button(view(),'Verify & Create Account').props.onPress();assert.equal(verifyCalls,0);
 assert.equal(button(view(),'Resend code in 60s').props.disabled,true);button(view(),'Resend code in').props.onPress();assert.equal(resendCalls,0);
 clock=60000;for(const fn of timers)fn();assert.equal(button(view(),'Resend code').props.disabled,false);
 const retry=button(view(),'Resend code').props.onPress;retry();retry();await flush();assert.equal(resendCalls,1);assert.equal(button(view(),'Resend code in 60s').props.disabled,true);
 codeInput().props.onChangeText('123456');const confirm=button(view(),'Verify & Create Account').props.onPress;confirm();confirm();assert.equal(verifyCalls,1);assert.equal(accepted,false);
 verify.reject(new api.ApiError('Wrong code',422));await flush();assert.match(texts(view()),/Wrong code/);
 button(view(),'Change email').props.onPress();assert.match(texts(view()),/Create Your Account/);assert.ok(boxes().every(b=>b.props.accessibilityState.checked));
 assert.equal(nodes(view()).find(n=>n.props?.placeholder==='Create a password').props.value,'');
 assert.equal(nodes(view()).find(n=>n.props?.placeholder==='Enter your email').props.value,'new@example.com');
 input('Create a password','password123');input('Confirm your password','password123');
 initial=deferred();button(view(),'Create Account').props.onPress();initial.resolve({pending_token:'pending-test',resend_after:60,expires_in:900});await flush();
 verify=deferred();codeInput().props.onChangeText('123456');button(view(),'Verify & Create Account').props.onPress();
 verify.resolve();await flush();assert.equal(accepted,true);
 h.unmount();assert.equal(timers.size,0);assert.ok(boxes().every(b=>!b.props.accessibilityState.checked));assert.equal(button(view(),'Create Account').props.disabled,true);
 console.log('PASS: registration contract, native/web date picker, Cancel/future dates, retained design/fields, inline consent, Cancel/I Agree, gating/reset, verification-only session, validation, resend, duplicate taps, errors and change-email cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});

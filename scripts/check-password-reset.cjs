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
 const calls=[];
 const contract=load('src/services/password-reset.ts',{'./api':{apiRequest:async(path,options)=>{calls.push({path,options});return {};}}});
 await contract.passwordResetApi.request(' donor@example.com ');
 await contract.passwordResetApi.verify('donor@example.com','012345');
 await contract.passwordResetApi.reset('donor@example.com','opaque-token','new-password','new-password');
 assert.deepEqual(Array.from(calls,c=>c.path),['/forgot-password/request','/forgot-password/verify','/forgot-password/reset']);
 assert.deepEqual(JSON.parse(JSON.stringify(calls.map(c=>c.options.body))),[
  {email:'donor@example.com'},{email:'donor@example.com',code:'012345'},
  {email:'donor@example.com',reset_token:'opaque-token',password:'new-password',password_confirmation:'new-password'}]);
 assert.ok(calls.every(c=>c.options.method==='POST'&&!c.options.token));
 native.KeyboardAvoidingView='KeyboardAvoidingView';native.Platform={OS:'android'};
 const routes=[],router={push:r=>routes.push(['push',r]),replace:r=>routes.push(['replace',r])};
 const loginHost=host();
 const login=load('src/app/(auth)/login.tsx',{...shared,react:loginHost.react,'expo-router':{useRouter:()=>router,useFocusEffect:loginHost.focus},'@/contexts/auth-context':{useAuth:()=>({busy:false,login:()=>{throw Error('Unexpected login');}})},'@/services/api':api},{setInterval:()=>0,clearInterval:()=>{}});
 assert.equal(button(loginHost.render(login.default),'Forgot Password'),undefined);
 assert.doesNotMatch(texts(loginHost.render(login.default)),/Password/);loginHost.unmount();
 function screen(){
  const h=host(),timers=new Set();let clock=0;
  const requests=[],backend={request:async()=>({message:contract.RESET_NOTICE,resend_after:60}),verify:async()=>({reset_token:'a'.repeat(64),expires_in:600}),reset:async()=>({message:'success'})};
  const screen=load('src/app/(auth)/forgot-password.tsx',{...shared,react:h.react,'expo-router':{useRouter:()=>router,useFocusEffect:h.focus},'@/services/api':api,
   '@/services/password-reset':{RESET_NOTICE:contract.RESET_NOTICE,passwordResetApi:Object.fromEntries(Object.keys(backend).map(key=>[key,(...args)=>{requests.push([key,...args]);return backend[key](...args);}]))}},
   {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
  const view=()=>h.render(screen.default);
  const input=(label,value)=>nodes(view()).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label).props.onChangeText(value);
  const tap=label=>{const b=button(view(),label);assert.ok(b,'Missing button '+label);b.props.onPress();};
  const tick=ms=>{clock+=ms;for(const fn of timers)fn();};
  return {h,view,input,tap,tick,backend,requests,timers};
 }
 const s=screen();
 assert.match(texts(s.view()),/Forgot Password/);assert.match(texts(s.view()),/Enter the email associated/);
 assert.equal(nodes(s.view()).find(n=>n.type==='KeyboardAvoidingView').props.behavior,'height');
 s.tap('Send verification code');assert.match(texts(s.view()),/valid email/);assert.equal(s.requests.length,0);
 s.input('Email','donor@example.com');
 const requested=deferred();s.backend.request=()=>requested.promise;
 const send=button(s.view(),'Send verification code').props.onPress;send();send();assert.equal(s.requests.length,1);
 assert.equal(button(s.view(),'Please wait').props.disabled,true);
 requested.resolve({});await flush();
 assert.match(texts(s.view()),/Verify your email/);assert.ok(texts(s.view()).includes(contract.RESET_NOTICE));assert.match(texts(s.view()),/Code expires in 15 minutes/);
 assert.equal(button(s.view(),'Resend code in 60s').props.disabled,true);
 s.tap('Resend code in');assert.equal(s.requests.length,1);
 s.tick(59000);assert.equal(button(s.view(),'Resend code in 1s').props.disabled,true);
 s.tick(1000);assert.equal(button(s.view(),'Resend code').props.disabled,false);
 s.backend.request=async()=>({});const resend=button(s.view(),'Resend code').props.onPress;resend();resend();await flush();assert.equal(s.requests.length,2);
 assert.equal(button(s.view(),'Resend code in 60s').props.disabled,true);
 s.input('6-digit code','12345');s.tap('Verify');assert.match(texts(s.view()),/Enter the 6-digit code/);assert.equal(s.requests.length,2);
 s.input('6-digit code','012345');s.backend.verify=async()=>{throw new api.ApiError('The code is invalid or expired.',422,{code:['Invalid']});};
 s.tap('Verify');await flush();assert.match(texts(s.view()),/invalid or expired/);
 s.backend.verify=async()=>({reset_token:'a'.repeat(64),expires_in:600});
 s.tap('Verify');await flush();assert.match(texts(s.view()),/Create a new password/);
 s.input('New password','short');s.input('Confirm new password','short');s.tap('Change Password');assert.match(texts(s.view()),/at least 8/);
 s.input('New password','new-password');s.input('Confirm new password','different');s.tap('Change Password');assert.match(texts(s.view()),/Passwords must match/);
 assert.equal(s.requests.filter(r=>r[0]==='reset').length,0);
 s.input('Confirm new password','new-password');
 assert.equal(nodes(s.view()).find(n=>n.props?.accessibilityLabel==='New password').props.secureTextEntry,true);
 s.tap('Show passwords');assert.equal(nodes(s.view()).find(n=>n.props?.accessibilityLabel==='New password').props.secureTextEntry,false);
 const saving=deferred();s.backend.reset=()=>saving.promise;
 const save=button(s.view(),'Change Password').props.onPress;save();save();assert.equal(s.requests.filter(r=>r[0]==='reset').length,1);
 assert.deepEqual(s.requests.at(-1),['reset','donor@example.com','a'.repeat(64),'new-password','new-password']);
 saving.resolve({});await flush();
 assert.match(texts(s.view()),/Password changed/);assert.equal(nodes(s.view()).filter(n=>n.type==='TextInput').length,0);
 assert.ok(!texts(s.view()).includes('new-password'));
 s.tap('Back to Login');assert.deepEqual(routes.pop(),['replace','/(auth)/login']);
 s.h.unmount();assert.equal(s.timers.size,0);
 assert.equal(nodes(s.view()).find(n=>n.props?.accessibilityLabel==='Email').props.value,'');
 // Uncertain requests offer honest errors; leaving the route discards late results.
 const late=screen();late.input('Email','donor@example.com');const pending=deferred();late.backend.request=()=>pending.promise;
 late.tap('Send verification code');late.h.unmount();pending.reject(new api.ApiError('late private error'));await flush();
 assert.match(texts(late.view()),/Forgot Password/);assert.ok(!texts(late.view()).includes('late private error'));
 const retry=screen();retry.input('Email','donor@example.com');retry.backend.request=async()=>{throw new api.ApiError('Too many requests. Please try again shortly.',429);};
 retry.tap('Send verification code');await flush();assert.match(texts(retry.view()),/Too many requests/);
 retry.backend.request=async()=>({});retry.tap('Send verification code');await flush();
 retry.input('6-digit code','123456');retry.tap('Verify');await flush();
 retry.input('New password','new-password');retry.input('Confirm new password','new-password');
 retry.backend.reset=async()=>{throw new api.ApiError('Reset authorization is invalid or expired. Request a new code.',422,{reset_token:['Expired']});};
 retry.tap('Change Password');await flush();assert.match(texts(retry.view()),/Verify your email/);assert.equal(nodes(retry.view()).find(n=>n.props?.accessibilityLabel==='6-digit code').props.value,'');
 retry.tap('Change email');assert.match(texts(retry.view()),/Forgot Password/);retry.h.unmount();
 console.log('PASS: public reset payloads, existing login entry, four steps, validation, neutral copy, resend timing, duplicate taps, opaque authorization, password rules, visibility, success navigation, cleanup and stale/error handling');
})().catch(error=>{console.error(error);process.exitCode=1;});

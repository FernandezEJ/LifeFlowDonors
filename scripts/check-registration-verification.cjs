/* Actual service/hook/screen handlers; native and React boundaries are mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={},globals={}){
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>{if (n === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}}); if(n.endsWith('.png')){assert.ok(fs.existsSync(require('node:path').resolve(require('node:path').dirname(path),n)));return n;}if(!(n in imports))throw Error('Unexpected import '+n);return imports[n];},...globals});return module.exports;
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
const nodes=v=>!v||typeof v!=='object'?[]:Array.isArray(v)?v.flatMap(nodes):[v,...nodes(v.props?.children)];
const texts=v=>nodes(v).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children).join('\n');
const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&texts(n).includes(label));
// Native paint cannot be reproduced by this host: enforce an opaque visual layer
// above the live input, including the gaps, rather than relying on transparent text.
function assertOtpLayers(tree,slotPattern){
 const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
 const input=nodes(tree).find(n=>n.type==='TextInput'),inputStyle=flat(input.props.style);
 const slots=nodes(tree).filter(n=>slotPattern.test(n.props?.testID||''));
 const layer=nodes(tree).find(n=>n.type==='View'&&Array.isArray(n.props.children)&&n.props.children.length===6&&n.props.children.every(child=>slots.includes(child)));
 const parent=nodes(tree).find(n=>Array.isArray(n.props?.children)&&n.props.children.includes(input)&&n.props.children.includes(layer));
 assert.ok(parent,'The native input and digit layer share the same entry bounds');
 assert.equal(flat(parent.props.style).position,'relative');
 assert.ok(flat(layer.props.style).zIndex>inputStyle.zIndex,'Native text/selection paint must remain behind the digit layer');
 assert.equal(flat(layer.props.style).backgroundColor,'#FFF9F2','The whole layer, including cell gaps, masks native paint');
 assert.equal(layer.props.pointerEvents,'none','Taps/long-presses reach the real input');
 assert.equal(layer.props.accessibilityElementsHidden,true);assert.equal(layer.props.importantForAccessibility,'no-hide-descendants');
 assert.equal(inputStyle.position,'absolute');for(const edge of ['top','right','bottom','left'])assert.equal(inputStyle[edge],0);
 assert.equal(inputStyle.color,'transparent');assert.notEqual(inputStyle.display,'none');assert.notEqual(inputStyle.opacity,0);
 assert.notEqual(input.props.pointerEvents,'none');assert.notEqual(input.props.accessible,false);assert.equal(input.props.editable,true);
 assert.ok(input.props.accessibilityLabel);assert.equal(input.props.autoComplete,'one-time-code');assert.equal(input.props.caretHidden,true);
 for(const prop of ['selectionColor','cursorColor','selectionHandleColor','underlineColorAndroid'])assert.equal(input.props[prop],'transparent');
 assert.equal(slots.length,6);assert.ok(slots.every(slot=>/^[0-9]?$/.test(texts(slot))),'Each cell draws at most one digit');
 assert.equal(slots.map(texts).join(''),input.props.value,'Only digit cells present the code visually');
}
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
 // Actual shared theme, with only native font selection mocked; no new harness.
 const {LifeFlowColors:p,DonationStatusColors:statusColors,Colors:theme}=load('src/constants/theme.ts',{'react-native':{Platform:{select:options=>options.default}}});
 const approved={floralWhite:'#FFF9F2',pastelPink:'#FFCAD0',racingRed:'#F10222',crushedBerry:'#892325',richMahogany:'#250202',
   primary:'#892325',primaryPressed:'#250202',onPrimary:'#FFF9F2',danger:'#B42318',success:'#15803D',pending:'#B45309',info:'#1D4ED8',neutral:'rgba(37,2,2,0.72)',
   background:'#FFF9F2',surface:'#FFF9F2',text:'#250202',border:'#FFCAD0',selected:'rgba(255,202,208,0.36)',
   successSurface:'#ECFDF3',successText:'#166534',pendingSurface:'#FFF7E6',pendingText:'#92400E',dangerSurface:'#FEF3F2',
   infoSurface:'#EFF6FF',neutralSurface:'rgba(255,202,208,0.18)',neutralText:'rgba(37,2,2,0.80)',revision:'#EA580C',revisionAction:'#C2410C',revisionPressed:'#9A3412',
   revisionText:'#9A3412',revisionSurface:'#FFF7ED',dangerPressed:'#912017',inactive:'#64748B',inactiveText:'#475569',inactiveSurface:'#F1F5F9'};
 for(const [name,value] of Object.entries(approved))assert.equal(p[name],value,`Approved ${name}`);
 // Composite transparent brand variants on their real surface before measuring AA.
 const paint=(value,under=[255,249,242])=>{
   let channels;if(value.startsWith('#')){let hex=value.slice(1);if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');channels=hex.match(/../g).map(v=>parseInt(v,16));if(channels.length===4)channels[3]/=255;}
   else channels=value.match(/[\d.]+/g).map(Number);
   const alpha=channels[3]??1;return channels.slice(0,3).map((v,i)=>v*alpha+under[i]*(1-alpha));
 };
 const luminance=rgb=>{const c=rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
 const contrast=(a,b)=>{const background=paint(b),x=luminance(paint(a,background)),y=luminance(background);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
 const pairs=[['text','background'],['neutral','background'],['neutral','surface'],['neutral','cream'],['primary','selected'],
   ['neutralText','selected'],['neutralText','neutralSurface'],['successText','successSurface'],['pendingText','pendingSurface'],
   ['danger','dangerSurface'],['info','infoSurface'],['revisionText','revisionSurface'],['neutralText','pointsSurface'],['inactiveText','inactiveSurface'],['text','pastelPink'],['primary','pastelPink']];
 for(const token of ['primary','primaryPressed','danger','dangerPressed','success','pending','revisionAction','revisionPressed','info'])pairs.push(['surface',token]);
 for(const [foreground,background] of pairs)assert.ok(contrast(p[foreground],p[background])>=4.5,`${foreground} on ${background} meets AA text contrast`);
 assert.ok(contrast(p.surface,p.revision)<4.5,'Bright orange is reserved for non-text accents; filled revision actions use darker orange');
 assert.ok(contrast(p.surface,p.racingRed)<4.5,'Racing Red remains an accent, never a normal-sized filled-button/text pair');
 for(const background of [p.cream,p.pastelPink])assert.ok(contrast(p.controlBorder,background)>=3,'Form outlines remain visible on brand surfaces');
 assert.equal(statusColors.pending.surface,p.pendingSurface);assert.equal(statusColors.for_verification.text,p.pendingText);
 assert.equal(statusColors.needs_revision.text,p.revisionText);assert.equal(statusColors.rejected.text,p.danger);assert.equal(statusColors.completed.text,p.successText);
 assert.notEqual(statusColors.pending.text,statusColors.needs_revision.text);assert.notEqual(statusColors.needs_revision.text,statusColors.rejected.text);
 assert.equal(statusColors.cancelled.text,p.inactiveText);assert.equal(statusColors.cancelled.surface,p.inactiveSurface);
 assert.equal(theme.light.tint,p.primary);assert.notEqual(theme.light.background,theme.dark.background,'Existing dark appearance remains available');
 let darkMode=false;
 const flowie=load('src/components/flowie-components.tsx',{...shared,'@/hooks/use-color-scheme':{useColorScheme:()=>darkMode?'dark':'light'},'@/constants/flowie-mascots':{FLOWIE_MASCOTS:{}},'@/services/flowie-preview':{flowieAction:()=>null}});
 assert.equal(flowie.useFlowieColors().surface,p.floralWhite);assert.equal(flowie.useFlowieColors().primary,p.crushedBerry);
 assert.equal(flowie.useFlowieColors().skeleton,p.skeleton,'Light Flowie and Activity Details share the same neutral skeleton fill');
 const scrim=p.backdrop.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);assert.ok(scrim);
 assert.equal(scrim[1],scrim[2]);assert.equal(scrim[2],scrim[3]);assert.ok(Number(scrim[4])>0&&Number(scrim[4])<=0.35,'Modal scrim is neutral and restrained');
 darkMode=true;const dark=flowie.useFlowieColors();assert.equal(dark.background,'#201B1C');assert.equal(dark.surface,'#2D2628');assert.equal(dark.border,'#594348');assert.equal(dark.controlBorder,dark.border);
 assert.equal(dark.skeleton,p.skeletonDark);assert.equal(p.skeletonDark,'rgba(255,249,242,0.18)','Dark skeleton exception stays light enough to see without a pink fill');
 for(const [foreground,background] of [[dark.text,dark.surface],[dark.muted,dark.background],[dark.accent,dark.soft],[dark.danger,dark.surface],[dark.success,dark.surface],[dark.white,dark.primary]])assert.ok(contrast(foreground,background)>=4.5,'Flowie dark text stays readable');
 // Source audit: shared tokens everywhere except deliberate dark Flowie/award artwork colors.
 const exceptions={
   'src/components/flowie-components.tsx':new Set(['#201B1C','#2D2628','#FFF4EF','#D0BFC0','#594348','#FF9BA3','#41292F','#FCA5A5','#86EFAC']),
   'src/app/(tabs)/profile.tsx':new Set(['#A86432','#F5E5D8','#78838D','#E9EDF0','#B97700','#FFF1D6']),
 };
 function audit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=dir+'/'+entry.name;if(entry.isDirectory()){audit(file);continue;}if(!/\.tsx?$/.test(file))continue;
   const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
   function visit(n){if(ts.isStringLiteral(n)&&/^(?:#[\da-f]{3,8}|rgba?\([^)]*\)|white|black)$/i.test(n.text)){
     assert.ok(!/^(?:#fff(?:fff)?(?:ff)?|white|rgba?\(\s*255\s*,\s*255\s*,\s*255(?:\s*,\s*1)?\s*\))$/i.test(n.text),file+': no pure-white general UI colors');
     if(file!=='src/constants/theme.ts')assert.ok(exceptions[file]?.has(n.text),file+': use a shared color token for '+n.text);
   }
   if(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n)){
     const props=n.attributes.properties,icon=props.find(a=>a.name?.getText(ast)==='name');
     if(icon?.initializer?.getText(ast)==='"chevron-right"')assert.equal(props.find(a=>a.name?.getText(ast)==='size')?.initializer?.getText(ast),'{22}',file+': navigation chevrons share one size');
   }
   ts.forEachChild(n,visit);}visit(ast);
 }}audit('src');
 console.log(`PASS: ${Object.keys(approved).length} approved mobile tokens, ${pairs.length} AA text pairs, accessible orange revision actions, distinct pending/revision/rejection/completion colors and preserved dark theme`);
 const api=load('src/services/api.ts',{}, {process:{env:{}},AbortController,setTimeout,clearTimeout});
 const requests=[],authService=load('src/services/auth.ts',{'./api':{...api,apiRequest:async(path,options)=>{requests.push({path,options});return {};}}});
 const fixture={acceptedTerms:true,acknowledgedPrivacy:true,acknowledgedPrescreening:true,firstName:'Test',middleName:'',lastName:'Donor',email:'new@example.com',mobileNumber:'09171234567',birthDate:'09/13/2004',gender:'Female',bloodType:'O+',password:'password123',confirmPassword:'password123'};
 await authService.authApi.register(fixture);
 assert.equal(requests[0].path,'/register/request-verification');assert.equal(requests[0].options.body.birth_date,'2004-09-13');assert.equal(requests[0].options.body.accepted_terms,true);assert.equal(requests[0].options.body.acknowledged_privacy,true);assert.equal(requests[0].options.body.acknowledged_prescreening,true);assert.equal(requests[0].options.token,undefined);
 await authService.authApi.verifyRegistration('pending','012345');assert.deepEqual(JSON.parse(JSON.stringify(requests[1].options.body)),{pending_token:'pending',code:'012345'});
 await authService.authApi.resendRegistration('pending');assert.deepEqual(JSON.parse(JSON.stringify(requests[2].options.body)),{pending_token:'pending'});
 const legal=load('src/components/registration-legal.tsx',shared);
 native.KeyboardAvoidingView='KeyboardAvoidingView';native.Modal='Modal';native.Platform={OS:'android'};
 // Passwordless API contract, Philippine calendar boundary and legacy initial display.
 assert.equal(requests[0].options.body.password,undefined);assert.equal(requests[0].options.body.password_confirmation,undefined);
 await authService.authApi.requestLoginCode('09171234567');
 assert.equal(requests.at(-1).path,'/auth/request-login-code');assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).options.body)),{identifier:'+639171234567'});
 await authService.authApi.login('+639171234567','012345');
 assert.equal(requests.at(-1).path,'/auth/verify-login-code');assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).options.body)),{identifier:'+639171234567',code:'012345'});
 for(const value of ['09171234567','639171234567',' +639171234567 ','(0917) 123-4567']){
   assert.equal(authService.normalizeLoginIdentifier(value),'+639171234567');assert.equal(authService.isLoginIdentifier(value),true);
 }
 for(const value of ['', ' ', '0917', '+14155551212', 'not-an-email', 'x@@example.test', 'a'.repeat(255)+'@example.test'])assert.equal(authService.isLoginIdentifier(value),false);
 await authService.authApi.requestLoginCode(' Recipient@Example.test ');
 assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).options.body)),{identifier:'recipient@example.test'});
 await authService.authApi.login(' Recipient@Example.test ','012345');
 assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1).options.body)),{identifier:'recipient@example.test',code:'012345'});
 const cutoff=authService.latestBirthDate(new Date('2026-09-30T16:00:00Z'));assert.equal(cutoff.getFullYear(),2008);assert.equal(cutoff.getMonth(),9);assert.equal(cutoff.getDate(),1);
 assert.equal(authService.middleInitial(' santos '),'S');assert.equal(authService.middleInitial(null),'');
 // Exercise the actual login handlers: duplicate taps, invalid/expired codes, resend, back and verified session handoff.
 const lh=host(),loginTimers=new Set(),loginRoutes=[];let loginClock=0,requested=0,logged=0,sessionAccepted=false;
 let requestGate=deferred(),loginFailure=null;
 const loginAuth={busy:false,requestLoginCode:async number=>{assert.equal(number,'+639171234567');requested++;return requestGate.promise;},login:async(number,code)=>{assert.equal(number,'+639171234567');assert.equal(code,'012345');logged++;if(loginFailure)throw loginFailure;sessionAccepted=true;}};
 const loginScreen=load('src/app/(auth)/login.tsx',{...shared,react:lh.react,'expo-router':{useRouter:()=>({push:route=>loginRoutes.push(route)}),useFocusEffect:lh.focus},'@/contexts/auth-context':{useAuth:()=>loginAuth},'@/services/api':api,'@/services/auth':authService},
 {performance:{now:()=>loginClock},setInterval:fn=>{loginTimers.add(fn);return fn;},clearInterval:fn=>loginTimers.delete(fn)});
 const lv=()=>lh.render(loginScreen.default),loginInput=()=>nodes(lv()).find(n=>n.type==='TextInput');
 assert.match(texts(lv()),/Email or Contact Number/);assert.doesNotMatch(texts(lv()),/Password/);assert.equal(nodes(lv()).filter(n=>n.type==='TextInput').length,1);
 const initialLogin=lv(),registerLink=button(initialLogin,'Register here'),registerRow=nodes(initialLogin).find(n=>n.type==='View'&&nodes(n).includes(registerLink)&&n.props.style?.flexDirection==='row');
 assert.equal(registerLink.props.accessibilityRole,'link');assert.equal(registerLink.props.accessibilityLabel,'Register here');
 assert.ok(registerLink.props.style.minHeight>=48);assert.equal(registerLink.props.style.paddingHorizontal,undefined);assert.equal(registerLink.props.style.padding,undefined);
 assert.equal(registerRow.props.style.flexWrap,'wrap');assert.ok(registerRow.props.style.gap<=6);
 assert.equal(registerLink.props.style.maxWidth,'100%');assert.equal(nodes(registerLink).find(n=>n.type==='Text').props.allowFontScaling,undefined);
 registerLink.props.onPress();assert.equal(loginRoutes.pop(),'/(auth)/register');
 loginInput().props.onChangeText('09171234567');const continueLogin=button(lv(),'Continue').props.onPress;continueLogin();continueLogin();assert.equal(requested,1);assert.equal(button(lv(),'Sending...').props.disabled,true);
 requestGate.resolve({resend_after:60,expires_in:600});await flush();assert.match(texts(lv()),/Verify Your Login/);assert.equal(button(lv(),'Resend in 60s').props.disabled,true);
 assert.equal(loginInput().props.keyboardType,'number-pad');assert.equal(loginInput().props.maxLength,6);assert.doesNotMatch(texts(lv()),/@/);
 // Six visual slots share the existing native input and never auto-submit.
 const loginSlots=()=>nodes(lv()).filter(n=>/^login-code-slot-\d$/.test(n.props?.testID||''));
 const style=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
 const focusedSlots=()=>loginSlots().filter(n=>style(n.props.style).borderWidth===2);
 const back=()=>nodes(lv()).find(n=>n.props?.accessibilityLabel==='Back to email or contact number');
 assert.match(texts(lv()),/Account Verification/);assert.doesNotMatch(texts(lv()),/Code expires in|Change Email or Contact Number|Trouble signing in\?/);
 assert.equal(nodes(lv()).filter(n=>n.props?.accessibilityRole==='link').length,0,'OTP has no secondary navigation links');
 const resendRow=()=>nodes(lv()).find(n=>n.type==='View'&&n.props.style?.flexDirection==='row'&&texts(n).includes('Didn’t receive the code?'));
 assert.ok(resendRow());assert.equal(resendRow().props.style.flexWrap,'wrap');assert.equal(resendRow().props.onPress,undefined);
 assert.ok(resendRow().props.style.columnGap<=8);assert.equal(resendRow().props.style.height,undefined);
 assert.equal(nodes(resendRow()).filter(n=>n.type==='Pressable').length,1,'Only the resend phrase is an action target');
 const resendPrompt=nodes(resendRow()).find(n=>n.type==='Text'&&texts(n)==='Didn’t receive the code?');
 assert.equal(resendPrompt.props.onPress,undefined);assert.equal(Object.assign({},...resendPrompt.props.style).maxWidth,'100%');
 assert.ok(button(resendRow(),'Resend in').props.style.minHeight>=48);assert.equal(button(resendRow(),'Resend in').props.style.paddingHorizontal,undefined);
 assert.match(texts(lv()),/Your account verification is secure/);assert.ok(button(lv(),'Verify & Continue'));
 assert.equal(loginSlots().length,6);assert.equal(nodes(lv()).filter(n=>n.type==='TextInput').length,1);
 assert.equal(loginInput().props.autoComplete,'one-time-code');assert.equal(loginInput().props.editable,true);
 assert.ok(loginInput().props.accessibilityHint.includes('paste'));
 for(const platform of ['android','ios']){
   native.Platform.OS=platform;
   for(const value of ['', '0', '01', '012', '0123', '01234', '012345', '01234', '01x2345678']){
     loginInput().props.onChangeText(value);assertOtpLayers(lv(),/^login-code-slot-\d$/);
   }
 }
 native.Platform.OS='android';loginInput().props.onChangeText('');assert.equal(logged,0);
 loginInput().props.onFocus();assert.equal(focusedSlots()[0].props.testID,'login-code-slot-0');
 loginInput().props.onChangeText('1');assert.equal(texts(loginSlots()[0]),'1');assert.equal(focusedSlots()[0].props.testID,'login-code-slot-1');
 loginInput().props.onChangeText('12');assert.equal(focusedSlots()[0].props.testID,'login-code-slot-2');
 loginInput().props.onChangeText('1');assert.equal(loginInput().props.value,'1');assert.equal(focusedSlots()[0].props.testID,'login-code-slot-1','Backspace moves the focus indicator back');
 loginInput().props.onChangeText('012345');assert.equal(loginSlots().map(texts).join(''),'012345');assert.equal(logged,0,'Paste/autofill does not submit');
 loginInput().props.onSelectionChange({nativeEvent:{selection:{start:2,end:2}}});assert.equal(focusedSlots()[0].props.testID,'login-code-slot-2');
 loginInput().props.onBlur();assert.equal(focusedSlots().length,0);
 const scroll=nodes(lv()).find(n=>n.type==='ScrollView');assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
 assert.equal(style(scroll.props.contentContainerStyle).flexGrow,1);assert.equal(style(scroll.props.contentContainerStyle).paddingHorizontal,20);
 assert.equal(nodes(lv()).find(n=>n.type==='KeyboardAvoidingView').props.behavior,'height');
 native.Platform.OS='ios';assert.equal(nodes(lv()).find(n=>n.type==='KeyboardAvoidingView').props.behavior,'padding');native.Platform.OS='android';
 const slotStyle=style(loginSlots()[0].props.style),digit=nodes(loginSlots()[0]).find(n=>n.type==='Text');
 assert.equal(slotStyle.flex,1);assert.equal(slotStyle.minWidth,0);assert.ok(slotStyle.minHeight>=44);
 assert.equal(digit.props.allowFontScaling,undefined,'Font scaling remains enabled');assert.equal(digit.props.maxFontSizeMultiplier,2);
 for(const width of [320,375])assert.ok((width-40-5*6)/6>digit.props.style.fontSize,'Six flexible cells have space for digits at narrow widths');
 button(lv(),'Resend in').props.onPress();assert.equal(requested,1,'Countdown also guards the handler');
 loginInput().props.onChangeText('12x');button(lv(),'Verify').props.onPress();assert.match(texts(lv()),/6-digit login code/);assert.equal(logged,0);
 for(const message of ['The login code is invalid.','The login code has expired.']){
   loginFailure=new api.ApiError(message,422,{code:[message]});loginInput().props.onChangeText('012345');const submit=button(lv(),'Verify').props.onPress;submit();submit();
   assert.equal(button(lv(),'Verifying...').props.disabled,true);assert.equal(loginInput().props.editable,false);assert.equal(back().props.disabled,true);
   back().props.onPress();assert.match(texts(lv()),/Account Verification/,'Back cannot interrupt an in-flight verification');
   await flush();assert.ok(texts(lv()).includes(message));assert.equal(loginInput().props.value,'012345','Errors preserve the entered code');
 }
 assert.equal(logged,2);assert.equal(sessionAccepted,false);
 loginClock=59000;loginTimers.forEach(fn=>fn());assert.doesNotMatch(texts(lv()),/Code expires in/);assert.equal(button(lv(),'Resend in 1s').props.disabled,true);
 loginClock=60000;loginTimers.forEach(fn=>fn());requestGate=deferred();const resendLogin=button(lv(),'Resend code').props.onPress;resendLogin();resendLogin();assert.equal(requested,2);
 assert.equal(button(lv(),'Sending...').props.disabled,true);assert.equal(button(resendRow(),'Sending…').props.accessibilityState.busy,true);
 assert.equal(button(resendRow(),'Sending…').props.disabled,true);requestGate.resolve({resend_after:17,expires_in:130});await flush();assert.equal(loginInput().props.value,'');
 assert.doesNotMatch(texts(lv()),/Code expires in/);assert.equal(button(lv(),'Resend in 17s').props.disabled,true);assert.match(texts(lv()),/New code requested/);
 loginClock=189999;loginTimers.forEach(fn=>fn());assert.doesNotMatch(texts(lv()),/Code expires in|Code expired/,'Valid code expiry occupies no UI space until the authoritative duration ends');
 loginClock=190000;loginTimers.forEach(fn=>fn());assert.match(texts(lv()),/Code expired\. Request a new code\./);assert.equal(button(lv(),'Resend code').props.disabled,false);assert.equal(logged,2);
 assert.ok(nodes(lv()).some(n=>n.props?.accessibilityRole==='alert'&&texts(n)==='Code expired. Request a new code.'));
 back().props.onPress();assert.match(texts(lv()),/Welcome to LifeFlow/);assert.equal(loginInput().props.value,'09171234567');assert.doesNotMatch(texts(lv()),/Code expires|Account Verification|New code requested/);assert.equal(loginRoutes.length,0,'Back returns to the number form without navigating to protected screens');
 requestGate=deferred();button(lv(),'Continue').props.onPress();requestGate.resolve({resend_after:60,expires_in:600});await flush();loginFailure=null;loginInput().props.onChangeText('012345');button(lv(),'Verify').props.onPress();await flush();assert.equal(sessionAccepted,true);
 lh.unmount();assert.equal(loginTimers.size,0);assert.equal(loginInput().props.value,'09171234567');
 // Server/network failures preserve the input and never turn into successful verification.
 function loginScenario(){
   const h=host(),timers=new Set(),calls=[],routes=[];let clock=0;
   const backend={request:async()=>({resend_after:12,expires_in:75}),verify:async()=>{}};
   const auth={busy:false,requestLoginCode:async value=>{calls.push(['request',value]);return backend.request();},login:async(mobile,code)=>{calls.push(['verify',mobile,code]);return backend.verify();}};
   const screen=load('src/app/(auth)/login.tsx',{...shared,react:h.react,'expo-router':{useRouter:()=>({push:route=>routes.push(route)}),useFocusEffect:h.focus},'@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':api,'@/services/auth':authService},
     {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
   const view=()=>h.render(screen.default),input=()=>nodes(view()).find(n=>n.type==='TextInput');
   return {h,auth,backend,calls,routes,view,input,tick:value=>{clock=value;timers.forEach(fn=>fn());},start:async(identifier='09171234567')=>{input().props.onChangeText(identifier);button(view(),'Continue').props.onPress();await flush();}};
 }
 const retryLogin=loginScenario();await retryLogin.start();assert.doesNotMatch(texts(retryLogin.view()),/Code expires in|Code expired/);
 for(const failure of [new api.ApiError('Too many attempts. Please try again later.',429),new api.ApiError('Unable to connect. Please retry.'),new Error('private transport details')]){
   retryLogin.backend.verify=async()=>{throw failure;};retryLogin.input().props.onChangeText('012345');button(retryLogin.view(),'Verify & Continue').props.onPress();await flush();
   assert.equal(retryLogin.input().props.value,'012345');assert.equal(button(retryLogin.view(),'Verify & Continue').props.disabled,false);
   assert.ok(nodes(retryLogin.view()).some(n=>n.props?.accessibilityRole==='alert'));assert.doesNotMatch(texts(retryLogin.view()),/private transport details/);
 }
 retryLogin.tick(12000);retryLogin.backend.request=async()=>{throw new api.ApiError('Please wait before requesting another code.',429);};
 button(retryLogin.view(),'Resend code').props.onPress();await flush();assert.match(texts(retryLogin.view()),/Please wait before/);assert.equal(retryLogin.input().props.value,'012345');assert.doesNotMatch(texts(retryLogin.view()),/Code expires in|Code expired/);
 retryLogin.tick(75000);assert.match(texts(retryLogin.view()),/Code expired\. Request a new code\./,'A failed resend cannot extend the original expiry');
 retryLogin.backend.request=async()=>({resend_after:9});button(retryLogin.view(),'Resend code').props.onPress();await flush();assert.doesNotMatch(texts(retryLogin.view()),/Code expires in|Code expired|Use the most recent code/,'No invented expiry or reserved timer text without API data');
 nodes(retryLogin.view()).find(n=>n.props?.accessibilityLabel==='Back to email or contact number').props.onPress();assert.match(texts(retryLogin.view()),/Welcome to LifeFlow/);assert.equal(retryLogin.routes.length,0);retryLogin.h.unmount();
 for(const [entered,normalized] of [[' Recipient@Example.test ','recipient@example.test'],[' (0917) 123-4567 ','+639171234567']]){
   const trial=loginScenario();
   assert.equal(trial.input().props.accessibilityLabel,'Email or Contact Number');assert.equal(trial.input().props.keyboardType,'email-address');
   assert.equal(trial.input().props.autoCapitalize,'none');assert.equal(trial.input().props.autoCorrect,false);assert.equal(trial.input().props.maxLength,254);
   button(trial.view(),'Trouble signing in?').props.onPress();assert.equal(trial.routes.pop(),'/(auth)/trouble-signing-in');
   for(const malformed of ['', 'invalid', '0917', 'a'.repeat(255)+'@example.test']){
     trial.input().props.onChangeText(malformed);button(trial.view(),'Continue').props.onPress();assert.equal(trial.calls.length,0);assert.match(texts(trial.view()),/valid email or Philippine contact number/);
   }
   await trial.start(entered);assert.deepEqual(trial.calls,[['request',normalized]]);
   assert.ok(texts(trial.view()).includes(authService.LOGIN_NOTICE));assert.doesNotMatch(texts(trial.view()),/recipient@example.test/);
   assert.doesNotMatch(texts(trial.view()),/Change Email or Contact Number|Trouble signing in\?|Code expires in/);
   trial.input().props.onChangeText('012345');button(trial.view(),'Verify & Continue').props.onPress();await flush();
   assert.deepEqual(trial.calls.at(-1),['verify',normalized,'012345']);
   trial.tick(12000);button(trial.view(),'Resend code').props.onPress();await flush();assert.deepEqual(trial.calls.at(-1),['request',normalized]);
   const staleVerify=button(trial.view(),'Verify & Continue').props.onPress;
   nodes(trial.view()).find(n=>n.props?.accessibilityLabel==='Back to email or contact number').props.onPress();assert.equal(trial.input().props.value,entered);
   assert.equal(trial.input().props.editable,true);assert.equal(trial.calls.at(-1)[0],'request');assert.equal(trial.calls.length,3,'Back neither requests nor verifies a code');
   assert.ok(button(trial.view(),'Trouble signing in?'),'Help stays available on initial login');
   const before=trial.calls.length;staleVerify();assert.equal(trial.calls.length,before,'An old OTP callback cannot verify after changing the identifier');
   trial.h.unmount();
 }
 console.log('PASS: single Email or Contact Number input, normalization/validation, generic notice without resolved email, help routing, same request/resend/verify identifier and stale-change safeguards');
 const staleLogin=loginScenario(),lateCode=deferred();staleLogin.backend.request=()=>lateCode.promise;
 staleLogin.input().props.onChangeText('09171234567');button(staleLogin.view(),'Continue').props.onPress();staleLogin.h.unmount();lateCode.resolve({resend_after:12,expires_in:75});await flush();
 assert.doesNotMatch(texts(staleLogin.view()),/Verify Your Login|Code expires in/,'Leaving ignores a late code request response');
 console.log('PASS: OTP hotfix: no secondary links or valid-code expiry text, accessible expired error at the unchanged deadline, compact wrapping resend row with 48dp action, cooldown/busy/double-tap safeguards, header Back preserves identifier without requests, compact accessible Register here footer; native keyboard/rotation/200% paint remains device QA');
 // Native picker uses calendar days, preserves Cancel and rejects future selections.
 const dh=host();let pickerOptions,selected='09/13/2004';
 const picker=load('src/components/birth-date-picker.tsx',{...shared,'@/services/auth':authService,react:dh.react,'@react-native-community/datetimepicker':{__esModule:true,default:'DateTimePicker',DateTimePickerAndroid:{open:options=>{pickerOptions=options;}}}});
 const dateView=()=>dh.render(()=>picker.default({value:selected,onChange:v=>{selected=v;}}));
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 assert.equal(pickerOptions.mode,'date');assert.equal(pickerOptions.display,'calendar');
 assert.ok(pickerOptions.maximumDate < new Date());
 assert.equal(pickerOptions.onChange,undefined);pickerOptions.onDismiss();assert.equal(selected,'09/13/2004');
 pickerOptions.onValueChange({},new Date(2099,1,1));assert.equal(selected,'09/13/2004');
 pickerOptions.onValueChange({},new Date(2000,1,29));assert.equal(selected,'02/29/2000');
 assert.equal(nodes(dateView()).filter(n=>n.type==='TextInput').length,0);
 native.Platform.OS='ios';
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 const change=()=>nodes(dateView()).find(n=>n.type==='DateTimePicker').props.onValueChange;
 change()({},new Date(2001,2,15));button(dateView(),'Cancel').props.onPress();assert.equal(selected,'02/29/2000');
 nodes(dateView()).find(n=>n.props?.accessibilityLabel==='Choose birth date').props.onPress();
 change()({},new Date(2001,2,15));button(dateView(),'Confirm').props.onPress();assert.equal(selected,'03/15/2001');
 assert.equal(nodes(dateView()).find(n=>n.type==='DateTimePicker').props.display,'spinner');
 // Browser fallback keeps draft dates separate until confirmed.
 const wh=host(),web=load('src/components/birth-date-picker.web.tsx',{...shared,'@/services/auth':authService,react:wh.react});
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
 for(const name of ['First Name','Middle Initial (Optional)','Last Name','Email Address','Mobile Number','Birth Date','Gender','Blood Type'])assert.ok(texts(view()).includes(name));
 assert.doesNotMatch(texts(view()),/Password/);
 const input=(placeholder,value)=>nodes(view()).find(n=>n.type==='TextInput'&&n.props.placeholder===placeholder).props.onChangeText(value);
 input('Enter your first name','Test');input('Enter your last name','Donor');input('Enter your email','new@example.com');input('09XXXXXXXXX','09171234567');
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
   assert.equal(nodes(view()).find(n=>n.props?.placeholder==='Enter your email').props.value,'new@example.com');
 }
 boxes()[2].props.onPress();assert.equal(button(view(),'Create Account').props.disabled,false);
 boxes()[0].props.onPress();assert.equal(button(view(),'Create Account').props.disabled,true);boxes()[0].props.onPress();
 const actionTree=view();
 const actionArea=nodes(actionTree).find(n=>n.type==='View'&&Array.isArray(n.props.style)&&n.props.style.some(style=>style?.marginTop===12&&style?.gap===10));
 assert.ok(actionArea);assert.ok(nodes(actionArea).includes(button(actionTree,'Create Account')));
 const submit=button(view(),'Create Account').props.onPress;submit();submit();assert.equal(createCalls,1);assert.equal(accepted,false);assert.equal(payload.birthDate,'09/13/2004');assert.equal(payload.acceptedTerms,true);assert.equal(payload.acknowledgedPrivacy,true);assert.equal(payload.acknowledgedPrescreening,true);
 initial.resolve({pending_token:'pending-test',resend_after:60,expires_in:900});await flush();
 assert.match(texts(view()),/Verify Your Email/);assert.equal(accepted,false);assert.equal(nodes(view()).filter(n=>n.type==='TextInput').length,1);
 const codeInput=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='6-digit code');
 codeInput().props.onChangeText('12345');button(view(),'Verify & Create Account').props.onPress();assert.equal(verifyCalls,0);
 assert.equal(button(view(),'Resend code in 60s').props.disabled,true);button(view(),'Resend code in').props.onPress();assert.equal(resendCalls,0);
 clock=60000;for(const fn of timers)fn();assert.equal(button(view(),'Resend code').props.disabled,false);
 const retry=button(view(),'Resend code').props.onPress;retry();retry();await flush();assert.equal(resendCalls,1);assert.equal(button(view(),'Resend code in 60s').props.disabled,true);
 codeInput().props.onChangeText('123456');const confirm=button(view(),'Verify & Create Account').props.onPress;confirm();confirm();assert.equal(verifyCalls,1);assert.equal(accepted,false);
 verify.reject(new api.ApiError('Wrong code',422));await flush();assert.match(texts(view()),/Wrong code/);
 button(view(),'Edit').props.onPress();assert.match(texts(view()),/Create Your Account/);assert.ok(boxes().every(b=>b.props.accessibilityState.checked));
 assert.ok(!nodes(view()).some(n=>n.props?.secureTextEntry));
 assert.equal(nodes(view()).find(n=>n.props?.placeholder==='Enter your email').props.value,'new@example.com');
 initial=deferred();button(view(),'Create Account').props.onPress();initial.resolve({pending_token:'pending-test',resend_after:60,expires_in:900});await flush();
 verify=deferred();codeInput().props.onChangeText('123456');button(view(),'Verify & Create Account').props.onPress();
 verify.resolve();await flush();assert.equal(accepted,true);
 h.unmount();assert.equal(timers.size,0);assert.ok(boxes().every(b=>!b.props.accessibilityState.checked));assert.equal(button(view(),'Create Account').props.disabled,true);
 // Task 02: the real registration component switches between the approved form and OTP branch.
 function registrationScenario(){
   const h=host(),timers=new Set(),calls=[],routes=[];let clock=0;
   const backend={request:async()=>({pending_token:'first-email-token',resend_after:23,expires_in:125}),
     resend:async()=>({resend_after:11,expires_in:81}),verify:async()=>{}};
   const auth={busy:false,register:async form=>{calls.push({kind:'request',form:{...form}});return backend.request();},
     verifyRegistration:async(token,code)=>{calls.push({kind:'verify',token,code});return backend.verify();}};
   const screen=load('src/app/(auth)/register.tsx',{...shared,react:h.react,
     'expo-router':{useRouter:()=>({push:route=>routes.push(route),replace:route=>routes.push(route)}),useFocusEffect:h.focus},
     '@/components/registration-legal':legal,'@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':api,
     '@/services/auth':{...authService,authApi:{resendRegistration:async token=>{calls.push({kind:'resend',token});return backend.resend();}}},
     '@/components/birth-date-picker':{__esModule:true,default:'BirthDatePicker'}},
     {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
   const view=()=>h.render(screen.default),field=placeholder=>nodes(view()).find(n=>n.type==='TextInput'&&n.props.placeholder===placeholder);
   const code=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='6-digit code');
   const edit=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='Edit registration email');
   const back=()=>nodes(view()).find(n=>n.props?.accessibilityLabel==='Back to registration');
   const fill=()=>{
     for(const [placeholder,value] of [['Enter your first name','Test'],['Middle initial (optional)','D'],['Enter your last name','Donor'],['Enter your email','new@example.com'],['09XXXXXXXXX','09171234567']])field(placeholder).props.onChangeText(value);
     nodes(view()).find(n=>n.type==='BirthDatePicker').props.onChange('09/13/2004');button(view(),'Female').props.onPress();button(view(),'O+').props.onPress();
     nodes(view()).filter(n=>n.props?.accessibilityRole==='checkbox').forEach(n=>n.props.onPress());
   };
   return {h,timers,calls,routes,auth,backend,view,field,code,edit,back,fill,tick:value=>{clock=value;timers.forEach(fn=>fn());},
     start:async()=>{fill();button(view(),'Create Account').props.onPress();await flush();}};
 }
 const reg=registrationScenario();await reg.start();
 const regSlots=()=>nodes(reg.view()).filter(n=>/^registration-code-slot-\d$/.test(n.props?.testID||''));
 assert.equal(regSlots().length,6);assert.equal(nodes(reg.view()).filter(n=>n.type==='TextInput').length,1);
 for(const copy of ['Create Account','Verify Your Email',"We've sent a 6-digit verification code to",'ne***@example.com','Enter verification code','Code expires in 02:05','Secure email verification'])assert.ok(texts(reg.view()).includes(copy),copy);
 assert.doesNotMatch(texts(reg.view()),/new@example.com|Step\s*\d|of 3|14:32|15 minutes/);
 assert.ok(nodes(reg.view()).find(n=>n.type==='Image'&&n.props.source.endsWith('LogoMascot.png')));
 assert.ok(reg.edit().props.style({pressed:false}).some(s=>s?.minHeight>=44));
 assert.equal(reg.code().props.autoComplete,'one-time-code');assert.equal(reg.code().props.keyboardType,'number-pad');assert.equal(reg.code().props.maxLength,6);
 for(const platform of ['android','ios']){
   native.Platform.OS=platform;
   for(const value of ['', '0', '01', '012', '0123', '01234', '012345', '01234', '01x2345678']){
     reg.code().props.onChangeText(value);assertOtpLayers(reg.view(),/^registration-code-slot-\d$/);
   }
 }
 native.Platform.OS='ios';reg.code().props.onChangeText('');assert.equal(reg.calls.filter(c=>c.kind==='verify').length,0);
 console.log('PASS: Both OTP screens mask native text/selection/cursor paint behind opaque touch-through digit layers; live full-size accessible inputs retain autofill/selection and six single-digit cells through typing, deletion and paste (mocked Android/iOS boundaries; device paint not simulated)');
 reg.code().props.onFocus();assert.equal(style(regSlots()[0].props.style).borderWidth,2);
 reg.code().props.onChangeText('1x2');assert.equal(reg.code().props.value,'12');assert.equal(style(regSlots()[2].props.style).borderWidth,2);
 reg.code().props.onChangeText('1');assert.equal(style(regSlots()[1].props.style).borderWidth,2);
 reg.code().props.onChangeText('012345');assert.equal(regSlots().map(texts).join(''),'012345');assert.equal(reg.calls.filter(c=>c.kind==='verify').length,0);
 reg.code().props.onSelectionChange({nativeEvent:{selection:{start:3,end:3}}});assert.equal(style(regSlots()[3].props.style).borderWidth,2);
 reg.code().props.onBlur();assert.ok(regSlots().every(n=>style(n.props.style).borderWidth===1));
 const otpScroll=nodes(reg.view()).find(n=>n.type==='ScrollView');assert.equal(otpScroll.props.keyboardShouldPersistTaps,'handled');
 assert.equal(otpScroll.props.contentContainerStyle.flexGrow,1);assert.equal(otpScroll.props.contentContainerStyle.paddingHorizontal,20);
 for(const width of [320,375])assert.ok((width-40-30)/6>24,'Flexible slots fit narrow viewports');
 assert.ok(regSlots().every(n=>style(n.props.style).minWidth===0&&style(n.props.style).minHeight>=44));
 assert.equal(nodes(regSlots()[0]).find(n=>n.type==='Text').props.maxFontSizeMultiplier,2);
 assert.equal(nodes(reg.view()).find(n=>n.type==='KeyboardAvoidingView').props.behavior,'padding');
 native.Platform.OS='android';assert.equal(nodes(reg.view()).find(n=>n.type==='KeyboardAvoidingView').props.behavior,'height');
 reg.tick(22000);assert.equal(button(reg.view(),'Resend code in 1s').props.disabled,true);button(reg.view(),'Resend code in').props.onPress();assert.equal(reg.calls.filter(c=>c.kind==='resend').length,0);
 reg.tick(23000);assert.match(texts(reg.view()),/Code expires in 01:42/);
 const resendGate=deferred();reg.backend.resend=()=>resendGate.promise;const resendNow=button(reg.view(),'Resend code').props.onPress;resendNow();resendNow();
 assert.equal(reg.calls.filter(c=>c.kind==='resend').length,1);assert.equal(reg.calls.at(-1).token,'first-email-token');
 assert.equal(reg.edit().props.disabled,true);reg.edit().props.onPress();assert.match(texts(reg.view()),/Verify Your Email/);
 resendGate.reject(new api.ApiError('Please wait before resending.',429));await flush();assert.equal(reg.code().props.value,'012345');assert.match(texts(reg.view()),/Please wait before resending/);assert.match(texts(reg.view()),/Code expires in 01:42/);
 reg.backend.resend=async()=>({resend_after:11,expires_in:81});button(reg.view(),'Resend code').props.onPress();await flush();
 assert.equal(reg.code().props.value,'');assert.match(texts(reg.view()),/Code expires in 01:21/);assert.match(texts(reg.view()),/New code requested/);assert.equal(button(reg.view(),'Resend code in 11s').props.disabled,true);
 reg.code().props.onChangeText('123');button(reg.view(),'Verify & Create Account').props.onPress();assert.equal(reg.calls.filter(c=>c.kind==='verify').length,0);
 for(const failure of [new api.ApiError('Invalid code.',422),new api.ApiError('Code expired.',422),new api.ApiError('Too many attempts.',429),new Error('private network diagnostics')]){
   const verifyGate=deferred();reg.backend.verify=()=>verifyGate.promise;reg.code().props.onChangeText('012345');const verifyNow=button(reg.view(),'Verify & Create Account').props.onPress;
   const beforeCalls=reg.calls.filter(c=>c.kind==='verify').length;verifyNow();verifyNow();assert.equal(reg.calls.filter(c=>c.kind==='verify').length,beforeCalls+1);
   assert.equal(reg.code().props.editable,false);assert.equal(reg.back().props.disabled,true);reg.back().props.onPress();assert.match(texts(reg.view()),/Verify Your Email/);
   verifyGate.reject(failure);await flush();assert.equal(reg.code().props.value,'012345');assert.doesNotMatch(texts(reg.view()),/private network diagnostics/);assert.ok(nodes(reg.view()).some(n=>n.props?.accessibilityRole==='alert'));
 }
 // Same details resume the same pending token and elapsed timers, without another email request.
 reg.tick(30000);reg.edit().props.onPress();assert.match(texts(reg.view()),/Create Your Account/);assert.equal(reg.field('Enter your email').props.autoFocus,true);
 for(const [placeholder,value] of [['Enter your first name','Test'],['Middle initial (optional)','D'],['Enter your last name','Donor'],['Enter your email','new@example.com'],['09XXXXXXXXX','09171234567']])assert.equal(reg.field(placeholder).props.value,value);
 assert.equal(nodes(reg.view()).find(n=>n.type==='BirthDatePicker').props.value,'09/13/2004');assert.ok(nodes(reg.view()).filter(n=>n.props?.accessibilityRole==='checkbox').every(n=>n.props.accessibilityState.checked));
 button(reg.view(),'Create Account').props.onPress();await flush();assert.equal(reg.calls.filter(c=>c.kind==='request').length,1);assert.equal(reg.code().props.value,'');assert.match(texts(reg.view()),/Code expires in 01:14/);assert.equal(button(reg.view(),'Resend code in 4s').props.disabled,true);
 reg.back().props.onPress();reg.field('Enter your email').props.onChangeText('updated@example.org');
 reg.backend.request=async()=>{throw new api.ApiError('Unable to send. Please retry.');};button(reg.view(),'Create Account').props.onPress();await flush();
 assert.match(texts(reg.view()),/Create Your Account/);assert.equal(reg.field('Enter your email').props.value,'updated@example.org');assert.match(texts(reg.view()),/Unable to send/);assert.doesNotMatch(texts(reg.view()),/ne\*\*\*@example.com/);
 reg.backend.request=async()=>({pending_token:'updated-email-token',resend_after:8,expires_in:94});const newRequest=button(reg.view(),'Create Account').props.onPress;const requestsBefore=reg.calls.filter(c=>c.kind==='request').length;
 newRequest();newRequest();await flush();assert.equal(reg.calls.filter(c=>c.kind==='request').length,requestsBefore+1);assert.equal(reg.calls.at(-1).form.email,'updated@example.org');
 assert.match(texts(reg.view()),/up\*\*\*@example.org/);assert.doesNotMatch(texts(reg.view()),/new@example.com|ne\*\*\*@example.com|updated@example.org/);assert.equal(reg.code().props.value,'');assert.match(texts(reg.view()),/Code expires in 01:34/);assert.equal(button(reg.view(),'Resend code in 8s').props.disabled,true);
 reg.backend.verify=async()=>{throw new api.ApiError('Try again.',422);};reg.code().props.onChangeText('123456');button(reg.view(),'Verify & Create Account').props.onPress();await flush();assert.equal(reg.calls.at(-1).token,'updated-email-token');
 reg.tick(38000);reg.backend.resend=async()=>({resend_after:5,expires_in:60});button(reg.view(),'Resend code').props.onPress();await flush();assert.equal(reg.calls.at(-1).token,'updated-email-token');
 reg.edit().props.onPress();reg.field('Enter your email').props.onChangeText('a@'+('long'.repeat(30))+'.test');reg.backend.request=async()=>({pending_token:'third-email-token',resend_after:4,expires_in:44});button(reg.view(),'Create Account').props.onPress();await flush();
 assert.ok(texts(reg.view()).includes('a***@'+('long'.repeat(30))+'.test'));assert.ok(nodes(reg.view()).some(n=>n.type==='Text'&&n.props.style?.flexShrink===1));
 reg.edit().props.onPress();reg.field('Enter your email').props.onChangeText('final@example.net');reg.backend.request=async()=>({pending_token:'final-email-token',resend_after:3});button(reg.view(),'Create Account').props.onPress();await flush();assert.match(texts(reg.view()),/fi\*\*\*@example.net/);assert.match(texts(reg.view()),/Use the most recent code/);assert.doesNotMatch(texts(reg.view()),/Code expires in/);
 reg.backend.verify=async()=>{};reg.code().props.onChangeText('012345');button(reg.view(),'Verify & Create Account').props.onPress();await flush();assert.equal(reg.calls.at(-1).token,'final-email-token');assert.equal(reg.routes.length,0,'Session acceptance remains owned by the existing auth provider');
 reg.h.unmount();assert.equal(reg.timers.size,0);assert.match(texts(reg.view()),/Create Your Account/);assert.ok(nodes(reg.view()).filter(n=>n.props?.accessibilityRole==='checkbox').every(n=>!n.props.accessibilityState.checked));
 const lateReg=registrationScenario(),lateChallenge=deferred();lateReg.backend.request=()=>lateChallenge.promise;lateReg.fill();button(lateReg.view(),'Create Account').props.onPress();lateReg.h.unmount();lateChallenge.resolve({pending_token:'late-token',resend_after:1,expires_in:2});await flush();assert.doesNotMatch(texts(lateReg.view()),/Verify Your Email/);
 const expiredReg=registrationScenario();await expiredReg.start();expiredReg.tick(125000);assert.match(texts(expiredReg.view()),/Code expired\. Request a new code\./);assert.equal(button(expiredReg.view(),'Resend code').props.disabled,false);expiredReg.h.unmount();
 const changedDetails=registrationScenario();await changedDetails.start();changedDetails.edit().props.onPress();changedDetails.field('Enter your first name').props.onChangeText('Updated');
 changedDetails.backend.request=async()=>({pending_token:'changed-details-token',resend_after:23,expires_in:125});button(changedDetails.view(),'Create Account').props.onPress();await flush();
 assert.equal(changedDetails.calls.filter(c=>c.kind==='request').length,2,'Changed details must not complete registration from the old payload');assert.equal(changedDetails.calls.at(-1).form.firstName,'Updated');changedDetails.code().props.onChangeText('012345');button(changedDetails.view(),'Verify & Create Account').props.onPress();await flush();assert.equal(changedDetails.calls.at(-1).token,'changed-details-token');changedDetails.h.unmount();
 console.log('PASS: Register OTP-only layout/real masked email/no steps, numeric slots/paste/deletion/focus, narrow-width and platform keyboard configuration, authoritative timers/resend/expiry, validation/errors/loading/duplicate guards; Edit preserves the original form, unchanged details reuse the challenge, changed/repeated/long emails and other changed fields use fresh tokens and timers, and leaving discards stale responses (mocked native boundaries)');
 console.log('PASS: registration contract, native/web date picker, Cancel/future dates, retained design/fields, inline consent, Cancel/I Agree, gating/reset, verification-only session, validation, resend, duplicate taps, errors and change-email cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});

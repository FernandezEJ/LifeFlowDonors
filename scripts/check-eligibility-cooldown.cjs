/* Actual service/hook/screen handlers; native and React boundaries are mocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,imports={},globals={}){
 if(path!=='src/services/date-presentation.ts'){const dates=load('src/services/date-presentation.ts');imports={'./date-presentation':dates,'@/services/date-presentation':dates,...imports};}
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
const native={View:'View',Text:'Text',Pressable:'Pressable',Image:'Image',ScrollView:'ScrollView',TextInput:'TextInput',StyleSheet:{create:x=>x},Alert:{alert:()=>{throw Error('Unexpected validation alert');}}};
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
 const assessment={id:1,result:'eligible',reasons:[],answers:{weight:60,sleepHours:8,currentSymptoms:'NO',medication:'NO',donatedWithinThreeMonths:'NO',feelsWell:'YES'},assessed_at:'2026-09-12T00:00:00Z'};
 const active={assessment,cooldown_active:true,next_allowed_at:'2026-09-13T00:00:00Z',remaining_seconds:120,server_time:'2026-09-12T23:58:00Z',is_on_donation_cooldown:false};
 const inactive={...active,cooldown_active:false,remaining_seconds:0};
 const api=load('src/services/api.ts',{}, {process:{env:{}},URL,__DEV__:true,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:false,status:409,json:async()=>active})});
 const eligibility=load('src/services/eligibility.ts',{'./api':api});
 const passing=Object.fromEntries(eligibility.QUESTIONS.map((q,i)=>[q.key,[1,2,3,4].includes(i)?'YES':'NO']));
 for(const result of ['basic_requirements_met','needs_further_review']){
  assert.equal(eligibility.permitsParticipationScreening({...assessment,assessment_version:'v5',result}),true);
  assert.equal(eligibility.permitsParticipationScreening({...assessment,result}),false);
 }
 for(const version of ['v4','', 'v5'])assert.equal(eligibility.permitsParticipationScreening({...assessment,assessment_version:version}),false);
 assert.equal(eligibility.permitsParticipationScreening(assessment),true);
 await assert.rejects(eligibility.eligibilityApi.submit('private',passing),e=>e instanceof eligibility.EligibilityCooldownError&&e.state.assessment.id===1);
 const requests=[],contract=load('src/services/eligibility.ts',{'./api':{...api,apiRequest:async(path,options)=>{requests.push({path,options});return active;}}});
 await contract.eligibilityApi.latest('private');await contract.eligibilityApi.submit('private',passing);
 assert.equal(requests[0].path,'/eligibility-assessments/latest?assessment_version=v5');assert.equal(requests[0].options.token,'private');assert.deepEqual(Object.keys(requests[1].options.body),['assessment_version','answers']);assert.equal(requests[1].options.body.assessment_version,'v5');
 let clock=0,appListener,calls=0,pending=deferred();const timers=new Set();
 const appState={currentState:'active',addEventListener:(_,fn)=>{appListener=fn;return {remove:()=>{appListener=null;}};}};
 const h=host(),auth={user:{id:1},eligibilityState:()=>{calls++;return pending.promise;}};
 const hook=load('src/hooks/use-eligibility-cooldown.ts',{react:h.react,'expo-router':{useFocusEffect:h.focus},'react-native':{AppState:appState},'@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':api},
 {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
 const render=()=>h.render(hook.useEligibilityCooldown);
 assert.equal(render().canSubmit,false);assert.equal(calls,1);pending.resolve(active);await flush();
 assert.equal(render().state.assessment.id,1);assert.equal(render().canSubmit,false);
 assert.equal(hook.formatEligibilityWait(86220),'Evaluate again in 23h 57m');assert.equal(hook.formatEligibilityWait(2700),'Evaluate again in 45m');
 // Deadline requires server confirmation, including an offline error and explicit retry.
 pending=deferred();clock=120000;for(const tick of [...timers])tick();
 assert.equal(calls,2);assert.equal(render().canSubmit,false);pending.reject(new api.ApiError('Offline'));await flush();
 assert.equal(render().error,'Offline');assert.equal(render().canSubmit,false);
 for(const tick of [...timers])tick();assert.equal(calls,2);
 pending=deferred();const retry=render().reload();pending.resolve(inactive);await retry;assert.equal(render().canSubmit,true);
 // Foreground reconciliation and stale-response cancellation preserve the lock.
 appState.currentState='background';appListener('background');assert.equal(render().canSubmit,false);
 pending=deferred();appState.currentState='active';appListener('active');assert.equal(calls,4);
 const old=pending;pending=deferred();const newer=render().reload();pending.resolve(active);await newer;old.resolve(inactive);await flush();
 assert.equal(render().canSubmit,false);assert.equal(render().state.cooldown_active,true);
 pending=deferred();const leaving=render().reload();h.unmount();pending.resolve(inactive);await leaving;assert.equal(appListener,null);assert.equal(timers.size,0);
 // Donation expiry also rechecks the server, without changing assessment authorization.
 const restHost=host();clock=0;pending=deferred();calls=0;
 const restHook=load('src/hooks/use-eligibility-cooldown.ts',{react:restHost.react,'expo-router':{useFocusEffect:restHost.focus},'react-native':{AppState:appState},'@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':api},
 {performance:{now:()=>clock},setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
 const restRender=()=>restHost.render(restHook.useEligibilityCooldown);
 restRender();pending.resolve({...inactive,is_on_donation_cooldown:true,donation_cooldown_remaining_seconds:60});await flush();
 assert.equal(restRender().canSubmit,true);pending=deferred();clock=60000;for(const tick of [...timers])tick();
 assert.equal(calls,2);assert.equal(restRender().state.is_on_donation_cooldown,true);
 pending.resolve({...inactive,is_on_donation_cooldown:false,donation_cooldown_remaining_seconds:0});await flush();
 assert.equal(restRender().state.is_on_donation_cooldown,false);restHost.unmount();assert.equal(timers.size,0);
 // Exercise the ten-question wizard and preserve the existing cooldown checks.
 const e=host();let submissions=0,reloads=0,backs=0;
 const ui={state:active,remaining:120,loading:false,error:'',canSubmit:false,reload:async()=>{reloads++;},accept:s=>{ui.state=s;ui.canSubmit=false;}};
 const routes=[],router={push:r=>routes.push(r),back:()=>{backs++;}};let submit=async()=>{submissions++;return assessment;};
 native.KeyboardAvoidingView='KeyboardAvoidingView';native.Platform={OS:'android'};
 const imports={...shared,react:e.react,'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>router},
 '@/components/notification-bell':{NotificationBell:'NotificationBell'},
 '@/contexts/auth-context':{useAuth:()=>({submitAssessment:(...args)=>submit(...args),profile:{}})},
 '@/services/api':api,'@/services/eligibility':eligibility,
 '@/hooks/use-eligibility-cooldown':{useEligibilityCooldown:()=>ui,formatEligibilityWait:hook.formatEligibilityWait}};
 const screen=load('src/app/evaluation.tsx',imports),view=()=>e.render(screen.default);
 // Initial availability is an exclusive gate, including failed requests and rapid Retry taps.
 ui.state=null;ui.loading=true;
 let initial=view();assert.equal(nodes(initial).filter(n=>n.type==='TabSkeleton').length,1);
 assert.equal(nodes(initial).find(n=>n.type==='TabSkeleton').props.variant,'summary');
 assert.match(texts(initial),/Self-Assessment/);assert.ok(nodes(initial).some(n=>n.props?.accessibilityLabel==='Go back'));
 assert.doesNotMatch(texts(initial),/Donation Readiness|Start Assessment|Not Yet Available|Assessment Complete|Question \d|Review Answers/);
 ui.loading=false;ui.error='Cannot reach the server';initial=view();
 assert.equal(nodes(initial).filter(n=>n.type==='TabSkeleton').length,0);assert.match(texts(initial),/Connection Problem/);
 assert.doesNotMatch(texts(initial),/Donation Readiness|Start Assessment|Not Yet Available/);
 const retryLookup=deferred(),originalReload=ui.reload;
 ui.reload=async()=>{reloads++;ui.loading=true;ui.error='';await retryLookup.promise;ui.state=active;ui.loading=false;};
 const retryButton=button(view(),'Retry availability check');const retrying=retryButton.props.onPress();retryButton.props.onPress();assert.equal(reloads,1);
 assert.ok(nodes(view()).some(n=>n.type==='TabSkeleton'));assert.equal(button(view(),'Start Assessment'),undefined);
 retryLookup.resolve();await retrying;assert.equal(nodes(view()).filter(n=>n.type==='TabSkeleton').length,0);
 ui.reload=originalReload;reloads=0;
 assert.match(texts(view()),/Self-Assessment Not Yet Available/);assert.match(texts(view()),/Available again:/);assert.doesNotMatch(texts(view()),/Your Pre-Screening Result/);
 button(view(),'Close').props.onPress();assert.equal(backs,1);
 ui.state={...inactive,assessment:null};ui.canSubmit=true;button(view(),'Start Assessment').props.onPress();
 const keys=['feverPastSevenDays','weightAtLeast50Kg','feelingWellToday','sleptAtLeastFiveHours','eatenMealToday','alcoholPast24Hours','donatedWithinThreeMonths','procedurePast12Months','medicationsOrSupplements','everReceivedTransfusion'];
 assert.equal(screen.QUESTIONS.length,10);assert.deepEqual(Array.from(screen.QUESTIONS,q=>q.key),keys);
 assert.deepEqual(Array.from(screen.QUESTIONS,q=>q.text),[
 'Have you experienced a fever in the past 7 days?',
 'Do you weigh at least 50 kilograms (110 pounds)?',
 'Are you feeling well today?',
 'Did you get at least 5 hours of sleep last night?',
 'Have you eaten a meal before donating today?',
 'Have you consumed alcohol within the past 24 hours?',
 'Have you donated blood within the past 3 months?',
 'Have you had a tattoo, body piercing, or acupuncture within the past 12 months?',
 'Are you currently taking any medications or supplements?',
 'Have you ever received a blood transfusion?'
 ]);
 // Conditional text is trimmed, bounded, mandatory only when visible, and cleared at both boundaries.
 for(const [field,key] of [['procedureType','procedurePast12Months'],['procedureWhen','procedurePast12Months'],['medications','medicationsOrSupplements'],['transfusionWhen','everReceivedTransfusion']]){
  const question=eligibility.QUESTIONS.find(q=>q.key===key);
  let draft={...passing,[key]:'YES',follow_ups:{procedureType:'Tattoo',procedureWhen:'About a year ago',medications:'Supplement',transfusionWhen:'Childhood'}};
  assert.ok(eligibility.validQuestion(question,draft));
  for(const bad of ['', ' ', 'x'.repeat(201), '<script>', 'bad\u0001text', null, [], 123]){
   assert.equal(eligibility.validQuestion(question,{...draft,follow_ups:{...draft.follow_ups,[field]:bad}}),false);
  }
  draft=eligibility.selectAnswer(draft,question,'NO');assert.equal(draft.follow_ups[field],undefined);
  assert.ok(eligibility.validQuestion(question,draft));
  const payload=eligibility.assessmentPayload({...passing,follow_ups:{[field]:'stale health data'}});
  assert.equal(payload.follow_ups,undefined,'No stale sensitive values in submitted payload');
 }
 const conditionalPayload=eligibility.assessmentPayload({...passing,medicationsOrSupplements:'YES',follow_ups:{medications:'  Example supplement  '}});
 assert.equal(conditionalPayload.follow_ups.medications,'Example supplement');
 assert.throws(()=>eligibility.assessmentPayload({}),/complete all/);
 for(const q of screen.QUESTIONS){assert.equal(screen.validAnswer(q,'YES'),true);assert.equal(screen.validAnswer(q,'NO'),true);for(const bad of ['','50','5','NOT_APPLICABLE','yes'])assert.equal(screen.validAnswer(q,bad),false);}
 const fill=(tree)=>{for(let i=0;i<10;i++){
   assert.match(texts(tree()),new RegExp('Question '+(i+1)+' of 10'));assert.equal(nodes(tree()).filter(n=>n.type==='TextInput').length,0);
   const choices=nodes(tree()).filter(n=>n.props?.accessibilityRole==='radio');assert.equal(choices.length,2);
   choices.find(n=>n.props.accessibilityLabel===([1,2,3,4].includes(i)?'Yes':'No')).props.onPress();button(tree(),'Next').props.onPress();
 }};
 assert.equal(button(view(),'Next').props.disabled,true);fill(view);assert.equal(submissions,0);assert.match(texts(view()),/Review Answers/);
 ui.loading=true;ui.canSubmit=false;assert.match(texts(view()),/Review Answers/);assert.ok(!nodes(view()).some(n=>n.type==='TabSkeleton'));
 assert.equal(button(view(),'Submit Assessment').props.disabled,true);
 ui.loading=false;ui.error='Offline';assert.match(texts(view()),/Review Answers/);assert.ok(button(view(),'Retry availability check'));assert.ok(!nodes(view()).some(n=>n.type==='TabSkeleton'));
 ui.error='';ui.canSubmit=true;
 button(view(),'Edit Answers').props.onPress();assert.equal(nodes(view()).find(n=>n.props?.accessibilityRole==='radio'&&n.props.accessibilityLabel==='No').props.accessibilityState.checked,true);fill(view);
 const saving=deferred();let payload;submit=answers=>{submissions++;payload=answers;return saving.promise;};
 const press=button(view(),'Submit Assessment').props.onPress;press();press();assert.equal(submissions,1);assert.equal(button(view(),'Submitting Assessment...').props.disabled,true);
 ui.state=null;ui.loading=true;assert.match(texts(view()),/Review Answers/);assert.ok(!nodes(view()).some(n=>n.type==='TabSkeleton'),'Submission uses button busy feedback, never hydration placeholders');
 ui.state={...inactive,assessment:null};ui.loading=false;
 assert.deepEqual(Object.keys(payload).filter(k=>k!=='follow_ups'),keys);for(let i=0;i<10;i++)assert.equal(payload[keys[i]],[1,2,3,4].includes(i)?'YES':'NO');
 const newAssessment={...assessment,id:2,assessment_version:'v5',result:'basic_requirements_met',answers:payload};ui.reload=async()=>{reloads++;ui.accept({...active,assessment:newAssessment});};saving.resolve(newAssessment);await flush();assert.equal(reloads,1);
 assert.match(texts(view()),/Assessment Complete/);assert.match(texts(view()),/Basic Requirements Met/);assert.doesNotMatch(texts(view()),/already completed|Available again:|Evaluate again|Not Yet Available/);
 ui.loading=true;ui.canSubmit=false;assert.match(texts(view()),/Assessment Complete/);assert.ok(!nodes(view()).some(n=>n.type==='TabSkeleton'));
 ui.state=null;assert.match(texts(view()),/Assessment Complete/);assert.ok(!nodes(view()).some(n=>n.type==='TabSkeleton'),'Saved result takes precedence during reconciliation');
 ui.state={...active,assessment:newAssessment};ui.loading=false;
 assert.ok(texts(view()).indexOf('Important Reminder')>texts(view()).indexOf('Your Pre-Screening Result'));assert.match(texts(view()),/qualified blood donation personnel/);assert.match(texts(view()),/does not confirm that a donation has occurred/);
 button(view(),'View Status').props.onPress();assert.equal(routes.pop(),'/(tabs)/status');button(view(),'Back to Flowie').props.onPress();assert.equal(routes.pop(),'/flowie');
 for(const result of ['not_eligible','temporarily_ineligible','needs_further_screening']){newAssessment.result=result;assert.match(texts(view()),/Assessment Required/);assert.match(texts(view()),/Important Reminder/);}newAssessment.result='basic_requirements_met';
 newAssessment.result='needs_further_review';assert.match(texts(view()),/Needs Further Review/);assert.match(texts(view()),/may still be able to donate/);newAssessment.result='basic_requirements_met';
 const returnHost=host(),returnScreen=load('src/app/evaluation.tsx',{...imports,react:returnHost.react});assert.match(texts(returnHost.render(returnScreen.default)),/Self-Assessment Not Yet Available/);returnHost.unmount();
 async function retryScenario(conflict){
   const local=host();ui.state={...inactive,assessment:null};ui.canSubmit=true;const module=load('src/app/evaluation.tsx',{...imports,react:local.react});const tree=()=>local.render(module.default);
   button(tree(),'Start Assessment').props.onPress();fill(tree);submit=async()=>{throw conflict?new eligibility.EligibilityCooldownError(active):new api.ApiError('Response lost');};ui.reload=async()=>{reloads++;ui.accept(active);};
   button(tree(),'Submit Assessment').props.onPress();await flush();assert.match(texts(tree()),conflict?/Self-Assessment Not Yet Available/:/Your Pre-Screening Result/);assert.equal(button(tree(),'Submit Assessment'),undefined);local.unmount();
 }
 await retryScenario(true);await retryScenario(false);
 // Real wizard conditional controls: no preselection, accessible labels, keyboard-safe scrolling,
 // answer changes clear local values, and stale input events cannot restore them.
 {
  const local=host();ui.state={...inactive,assessment:null};ui.canSubmit=true;ui.loading=false;ui.error='';
  const module=load('src/app/evaluation.tsx',{...imports,react:local.react}),tree=()=>local.render(module.default);
  button(tree(),'Start Assessment').props.onPress();
  for(let i=0;i<7;i++){
   const choices=nodes(tree()).filter(n=>n.props?.accessibilityRole==='radio');
   assert.ok(choices.every(n=>n.props.accessibilityState.checked===false));
   choices.find(n=>n.props.accessibilityLabel===([1,2,3,4].includes(i)?'Yes':'No')).props.onPress();button(tree(),'Next').props.onPress();
  }
  assert.equal(nodes(tree()).filter(n=>n.type==='TextInput').length,0);
  button(tree(),'Yes').props.onPress();
  let fields=nodes(tree()).filter(n=>n.type==='TextInput');assert.equal(fields.length,2);assert.equal(button(tree(),'Next').props.disabled,true);
  for(const field of fields){assert.ok(field.props.accessibilityLabel);assert.equal(field.props.maxLength,200);assert.equal(field.props.editable,true);field.props.onChangeText('About a year ago');}
  assert.equal(button(tree(),'Next').props.disabled,false);
  button(tree(),'No').props.onPress();fields[0].props.onChangeText('stale native event');
  assert.equal(nodes(tree()).filter(n=>n.type==='TextInput').length,0);
  button(tree(),'Yes').props.onPress();assert.ok(nodes(tree()).filter(n=>n.type==='TextInput').every(n=>n.props.value===''));
  button(tree(),'No').props.onPress();button(tree(),'Next').props.onPress();
  button(tree(),'Yes').props.onPress();fields=nodes(tree()).filter(n=>n.type==='TextInput');assert.equal(fields.length,1);
  fields[0].props.onChangeText('Example supplement');button(tree(),'Next').props.onPress();
  button(tree(),'Yes').props.onPress();fields=nodes(tree()).filter(n=>n.type==='TextInput');assert.equal(fields.length,1);
  fields[0].props.onChangeText('Childhood');button(tree(),'Next').props.onPress();
  assert.match(texts(tree()),/Review Answers/);assert.equal(nodes(tree()).find(n=>n.type==='ScrollView').props.keyboardShouldPersistTaps,'handled');
  let submitted;submit=async answers=>{submitted=answers;throw new api.ApiError('Temporary save failure');};
  ui.reload=async()=>{ui.state={...inactive,assessment:null};ui.canSubmit=true;};
  button(tree(),'Submit Assessment').props.onPress();await flush();assert.match(texts(tree()),/Temporary save failure/);
  assert.doesNotMatch(texts(tree()),/Assessment Complete|Basic Requirements Met|Needs Further Review/);
  assert.match(texts(tree()),/Example supplement/);assert.equal(submitted.follow_ups.procedureType,undefined);
  const wire=eligibility.assessmentPayload(submitted);assert.equal(wire.follow_ups.medications,'Example supplement');assert.equal(wire.follow_ups.procedureType,undefined);
  submit=async()=>({...newAssessment,result:'needs_further_review'});button(tree(),'Submit Assessment').props.onPress();await flush();
  assert.match(texts(tree()),/Needs Further Review/);assert.doesNotMatch(texts(tree()),/Example supplement|Childhood/);local.unmount();
  ui.reload=async()=>{reloads++;};
 }
 // Status retains the result, locks its action, and keeps the Flowie destination.
 const statusHost=host();
 const status=load('src/app/(tabs)/status.tsx',{...imports,react:statusHost.react,'expo-router':{useRouter:()=>router,useFocusEffect:statusHost.focus}});
 const statusView=()=>statusHost.render(status.default);
 const mascot=tree=>nodes(tree).find(n=>n.type==='Image').props.source;
 assert.equal(eligibility.formatDonationRestDate('2026-12-31T16:00:00Z'),'January 1, 2027');
 for(const assessmentValue of [assessment,{...assessment,result:'not_eligible'},null]){
  ui.state={...active,assessment:assessmentValue,is_on_donation_cooldown:true,next_eligible_donation_at:'2026-12-31T16:00:00Z'};
  const restText=texts(statusView());assert.match(restText,/Donation Rest Period/);assert.match(restText,/You recently completed a blood donation/);
  assert.match(restText,/January 1, 2027/);assert.match(restText,/helps ensure enough recovery time/);assert.doesNotMatch(restText,/Ready to proceed|You are eligible/);
  assert.equal(mascot(statusView()),'../../../assets/images/RestMascot.png','Active post-donation rest overrides eligible, not-eligible and absent assessments');
  ui.error='Offline';assert.match(texts(statusView()),/Donation Rest Period/);assert.equal(mascot(statusView()),'../../../assets/images/RestMascot.png');ui.error='';
 }
 ui.state={...active,assessment:newAssessment,is_on_donation_cooldown:false,next_eligible_donation_at:'2026-01-01T00:00:00+08:00'};
 assert.match(texts(statusView()),/Basic Requirements Met/);assert.doesNotMatch(texts(statusView()),/Donation Rest Period/);
 assert.equal(mascot(statusView()),'../../../assets/images/HappyMascot.png','Ended donation rest restores the ordinary assessment mascot');
 for(const [result,label] of [['eligible','Assessment Required'],['not_eligible','Assessment Required'],['temporarily_ineligible','Assessment Required'],['needs_further_screening','Assessment Required']]){
   ui.state={...active,assessment:{...assessment,result}};
   assert.ok(texts(statusView()).includes(label));
   assert.equal(mascot(statusView()),'../../../assets/images/'+(result==='eligible'?'HappyMascot.png':'SadMascot.png'));
 }
 ui.state=active;
 // Status retains its cards while showing timestamps and all saved answers.
 const summaryValue=(tree,label)=>{
   const row=nodes(tree).find(n=>n.type==='View'&&Array.isArray(n.props.children)&&n.props.children[0]?.type==='Text'&&n.props.children[0].props.children===label);
   assert.ok(row,'Missing summary label: '+label);
   return row.props.children[1].props.children;
 };
 ui.state={...active,assessment:newAssessment};
 for(let i=0;i<screen.QUESTIONS.length;i++)assert.equal(summaryValue(statusView(),(i+1)+'. '+screen.QUESTIONS[i].text),[1,2,3,4].includes(i)?'Yes':'No');
 ui.state={...inactive,assessment:null,next_allowed_at:null};ui.canSubmit=true;ui.error='';
 let empty=statusView();
 assert.match(texts(empty),/Assessment Required/);
 assert.match(texts(empty),/Donor Summary/);
 assert.equal(mascot(empty),'../../../assets/images/HappyMascot.png');
 assert.equal(summaryValue(empty,'Assessed'),'Not assessed');
 assert.equal(summaryValue(empty,'Next self-assessment available'),'Not available');
 assert.equal((texts(empty).match(/Not recorded/g)||[]).length,0);
 button(empty,'Take Self-Assessment').props.onPress();assert.equal(routes.pop(),'/evaluation');
 const detailed={...assessment,result:'not_eligible',reasons:['First server reason','Second server reason'],answers:{
   weight:62,sleepHours:1,currentSymptoms:'YES',donatedWithinThreeMonths:'NO',feelsWell:'YES',currentlyPregnant:'NOT_APPLICABLE',
   takingAntibioticsForActiveInfection:'NO',stillRecoveringFromProcedure:'YES',activeOrRecoveringInfection:'NO',weakDizzyOrUnusuallyTired:'YES'
 }};
 ui.state={...active,assessment:detailed};ui.canSubmit=false;
 const detail=statusView();
 assert.match(texts(detail),/Assessment Required/);assert.doesNotMatch(texts(detail),/First server reason|Second server reason|Previous Assessment/);
 // Preserve the sad mascot already supplied and wired before this cleanup.
 const countdowns=tree=>nodes(tree).filter(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.startsWith('Available again in '));
 assert.equal(countdowns(empty).length,0);
 assert.equal(countdowns(detail).length,1);
 assert.equal(countdowns(detail)[0].props.children,'Available again in 2m');
 assert.equal(button(detail,'Take Self-Assessment'),undefined,'A running retake window shows availability instead of an unusable CTA');
 assert.ok(!/Evaluation completed recently|Evaluate again in|Next self-assessment available:/.test(texts(detail)));
 ui.remaining=83880;assert.equal(countdowns(statusView())[0].props.children,'Available again in 23h 18m');ui.remaining=120;
 // Seconds in the server timestamp must not appear in displayed summary dates.
 ui.state={...active,assessment:{...detailed,assessed_at:'2026-09-12T00:00:37Z'},next_allowed_at:'2026-09-13T00:00:37Z'};
 assert.equal(summaryValue(statusView(),'Assessed'),summaryValue(detail,'Assessed'));
 assert.equal(summaryValue(statusView(),'Next self-assessment available'),summaryValue(detail,'Next self-assessment available'));
 ui.state={...active,assessment:detailed};
 assert.equal(mascot(detail),'../../../assets/images/SadMascot.png');
 assert.equal(summaryValue(detail,'Assessed'),'September 12, 2026 at 8:00 AM');
 assert.equal(summaryValue(detail,'Next self-assessment available'),'September 13, 2026 at 8:00 AM');
 assert.doesNotMatch(texts(detail),/1\. Weight|62 kg|Current symptoms|Currently pregnant/,'Status no longer renders legacy answers');
 const legacySnapshot=JSON.stringify(detailed);statusView();assert.equal(JSON.stringify(detailed),legacySnapshot,'Presentation must not mutate historical answers/results');
 assert.ok(!/Next Eligibility|Eligible again at|Medical clearance date/.test(texts(detail)));
 assert.match(texts(detail),/This is a preliminary self-assessment only/);
 ui.remaining=0;assert.equal(button(statusView(),'Take Self-Assessment'),undefined);
 ui.remaining=120;ui.state={...active,assessment:{...detailed,result:'eligible',reasons:[],answers:{...detailed.answers,sleepHours:7}}};
 assert.doesNotMatch(texts(statusView()),/Sleep last night|7 hours/);
 assert.equal(mascot(statusView()),'../../../assets/images/HappyMascot.png');
 assert.ok(!nodes(statusView()).some(n=>n.type==='Text'&&n.props.children==='Reason'));
 ui.state=active;
 assert.doesNotMatch(texts(statusView()),/Taking antibiotics for an active infection|Currently pregnant/);
 ui.state={...active,assessment:{...detailed,assessed_at:'invalid',answers:{...detailed.answers,weight:null,sleepHours:undefined}}};
 assert.equal(summaryValue(statusView(),'Assessed'),'Not recorded');
 assert.doesNotMatch(texts(statusView()),/1\. Weight/);
 ui.error='Offline';ui.canSubmit=false;
 assert.equal(mascot(statusView()),'../../../assets/images/SadMascot.png','Refresh failure preserves the previously loaded status mascot');
 assert.equal(button(statusView(),'Take Self-Assessment'),undefined);
 ui.error='';ui.state=active;
 let tree=statusView();assert.match(texts(tree),/Assessment Required/);assert.match(texts(tree),/Available again in 2m/);
 assert.equal(button(tree,'Take Self-Assessment'),undefined);assert.equal(routes.length,0);
 ui.state=inactive;ui.canSubmit=true;tree=statusView();assert.equal(countdowns(tree).length,0);assert.equal(button(tree,'Take Self-Assessment').props.disabled,false);button(tree,'Take Self-Assessment').props.onPress();assert.equal(routes.pop(),'/evaluation');
 ui.canSubmit=false;ui.error='Offline';tree=statusView();const before=reloads;await button(tree,'Retry availability check').props.onPress();assert.equal(reloads,before+1);

 // V5 Status: no follow-up details, honest preliminary headings, verified history independent of result.
 for(const result of ['basic_requirements_met','needs_further_review']){
  const v5={...newAssessment,result,answers:{...passing,follow_ups:{medications:'sensitive fixture'}}};
  ui.state={...active,assessment:v5};ui.canSubmit=false;
  assert.match(texts(statusView()),result==='basic_requirements_met'?/Basic Requirements Met/:/Needs Further Review/);
  assert.doesNotMatch(texts(statusView()),/sensitive fixture|Donation Completed|Donation Rest Period/);
  assert.equal(button(statusView(),'Update Status with Flowie'),undefined);
  ui.state={...ui.state,is_on_donation_cooldown:true,last_completed_donation_at:'2026-10-01T00:00:00Z',next_eligible_donation_at:'2027-01-01T00:00:00+08:00'};
  const rest=statusView();assert.match(texts(rest),/Donation Rest Period/);assert.doesNotMatch(texts(rest),/Donation Completed|Last verified donation/);
  assert.equal(mascot(rest),'../../../assets/images/RestMascot.png');assert.match(texts(rest),/January 1, 2027/);
  ui.state={...ui.state,is_on_donation_cooldown:false};assert.doesNotMatch(texts(statusView()),/Donation Completed|Donation Rest Period|Last verified donation/);
  assert.equal(ui.state.last_completed_donation_at,'2026-10-01T00:00:00Z','Removing the Status card must not clear server completion metadata');
 }
 // Plain donor copy and concise follow-up labels; internal versions and rules remain.
 assert.deepEqual(Array.from(eligibility.FOLLOW_UPS,f=>f.label),['Which procedure?','When was it done?','Which medication or supplement?','When did it happen?']);
 for(const assessmentValue of [null,assessment,detailed,newAssessment,{...newAssessment,result:'needs_further_review'}]){
  ui.state={...inactive,assessment:assessmentValue};ui.canSubmit=true;ui.error='';
  const plain=texts(statusView());assert.doesNotMatch(plain,/Previous Assessment|Donation Completed|Last verified donation|\bV5\b|version|approximate timing/i);
  if(!eligibility.isV5Assessment(assessmentValue)){assert.match(plain,/Assessment Required/);assert.ok(button(statusView(),'Take Self-Assessment'));}
 }
 assert.equal(eligibility.ASSESSMENT_VERSION,'v5');
 const evaluationSource=fs.readFileSync('src/app/evaluation.tsx','utf8');assert.doesNotMatch(evaluationSource,/approximate timing|no additional medical history/i);
 const flowie=load('src/services/flowie-preview.ts');assert.equal(flowie.flowieAction('open_evaluation').route,'/evaluation');
 console.log('Eligibility checks passed: exact questionnaire/conditional clearing, server results, plain donor copy, hidden legacy/completion sections, retained rest/availability, history metadata, submission/retry guards and Flowie navigation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

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
 const api=load('src/services/api.ts',{}, {process:{env:{}},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:false,status:409,json:async()=>active})});
 const eligibility=load('src/services/eligibility.ts',{'./api':api});
 await assert.rejects(eligibility.eligibilityApi.submit('private',assessment.answers),e=>e instanceof eligibility.EligibilityCooldownError&&e.state.assessment.id===1);
 const requests=[],contract=load('src/services/eligibility.ts',{'./api':{...api,apiRequest:async(path,options)=>{requests.push({path,options});return active;}}});
 await contract.eligibilityApi.latest('private');await contract.eligibilityApi.submit('private',assessment.answers);
 assert.equal(requests[0].path,'/eligibility-assessments/latest');assert.equal(requests[0].options.token,'private');assert.deepEqual(Object.keys(requests[1].options.body),['answers']);
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
 assert.match(texts(view()),/Self-Assessment Not Yet Available/);assert.match(texts(view()),/Available again:/);assert.doesNotMatch(texts(view()),/Your Pre-Screening Result/);
 button(view(),'Close').props.onPress();assert.equal(backs,1);
 ui.state={...inactive,assessment:null};ui.canSubmit=true;button(view(),'Start Assessment').props.onPress();
 const keys=['weightAtLeast50Kg','sleptAtLeastFiveHours','eatenProperMeal','avoidedAlcoholFor24Hours','threeMonthsSinceLastDonation','recentFeverInfectionOrIllness','unusualBleedingWeaknessOrDizziness','recentSurgeryOrMajorProcedure','medicationAffectingDonation','conditionOrTreatmentRequiringWait'];
 assert.equal(screen.QUESTIONS.length,10);assert.deepEqual(Array.from(screen.QUESTIONS,q=>q.key),keys);
 assert.ok(!screen.QUESTIONS.some(q=>/tattoo|piercing|feel well enough|age|pregnant/i.test(q.text)));
 for(const q of screen.QUESTIONS){assert.equal(screen.validAnswer(q,'YES'),true);assert.equal(screen.validAnswer(q,'NO'),true);for(const bad of ['','50','5','NOT_APPLICABLE','yes'])assert.equal(screen.validAnswer(q,bad),false);}
 const fill=(tree)=>{for(let i=0;i<10;i++){
   assert.match(texts(tree()),new RegExp('Question '+(i+1)+' of 10'));assert.equal(nodes(tree()).filter(n=>n.type==='TextInput').length,0);
   const choices=nodes(tree()).filter(n=>n.props?.accessibilityRole==='radio');assert.equal(choices.length,2);
   choices.find(n=>n.props.accessibilityLabel===(i<5?'Yes':'No')).props.onPress();button(tree(),'Next').props.onPress();
 }};
 assert.equal(button(view(),'Next').props.disabled,true);fill(view);assert.equal(submissions,0);assert.match(texts(view()),/Review Answers/);
 button(view(),'Edit Answers').props.onPress();assert.equal(nodes(view()).find(n=>n.props?.accessibilityRole==='radio'&&n.props.accessibilityLabel==='Yes').props.accessibilityState.checked,true);fill(view);
 const saving=deferred();let payload;submit=answers=>{submissions++;payload=answers;return saving.promise;};
 const press=button(view(),'Submit Assessment').props.onPress;press();press();assert.equal(submissions,1);assert.equal(button(view(),'Submitting Assessment...').props.disabled,true);
 assert.deepEqual(Object.keys(payload),keys);for(let i=0;i<10;i++)assert.equal(payload[keys[i]],i<5?'YES':'NO');
 const newAssessment={...assessment,id:2,answers:payload};ui.reload=async()=>{reloads++;ui.accept({...active,assessment:newAssessment});};saving.resolve(newAssessment);await flush();assert.equal(reloads,1);
 assert.match(texts(view()),/Assessment Complete/);assert.match(texts(view()),/Ready to proceed/);assert.doesNotMatch(texts(view()),/already completed|Available again:|Evaluate again|Not Yet Available/);
 assert.ok(texts(view()).indexOf('Important Reminder')>texts(view()).indexOf('Your Pre-Screening Result'));assert.match(texts(view()),/Recent tattoos or body piercings/);assert.match(texts(view()),/Final eligibility will still be confirmed by the donation facility/);
 button(view(),'View Status').props.onPress();assert.equal(routes.pop(),'/(tabs)/status');button(view(),'Back to Flowie').props.onPress();assert.equal(routes.pop(),'/flowie');
 for(const result of ['not_eligible','temporarily_ineligible','needs_further_screening']){newAssessment.result=result;assert.match(texts(view()),/Not Eligible for Now/);assert.match(texts(view()),/Important Reminder/);}newAssessment.result='eligible';
 const returnHost=host(),returnScreen=load('src/app/evaluation.tsx',{...imports,react:returnHost.react});assert.match(texts(returnHost.render(returnScreen.default)),/Self-Assessment Not Yet Available/);returnHost.unmount();
 async function retryScenario(conflict){
   const local=host();ui.state={...inactive,assessment:null};ui.canSubmit=true;const module=load('src/app/evaluation.tsx',{...imports,react:local.react});const tree=()=>local.render(module.default);
   button(tree(),'Start Assessment').props.onPress();fill(tree);submit=async()=>{throw conflict?new eligibility.EligibilityCooldownError(active):new api.ApiError('Response lost');};ui.reload=async()=>{reloads++;ui.accept(active);};
   button(tree(),'Submit Assessment').props.onPress();await flush();assert.match(texts(tree()),conflict?/Self-Assessment Not Yet Available/:/Your Pre-Screening Result/);assert.equal(button(tree(),'Submit Assessment'),undefined);local.unmount();
 }
 await retryScenario(true);await retryScenario(false);
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
 ui.state={...active,is_on_donation_cooldown:false,next_eligible_donation_at:'2026-01-01T00:00:00+08:00'};
 assert.match(texts(statusView()),/Ready to proceed/);assert.doesNotMatch(texts(statusView()),/Donation Rest Period/);
 assert.equal(mascot(statusView()),'../../../assets/images/HappyMascot.png','Ended donation rest restores the ordinary assessment mascot');
 for(const [result,label] of [['eligible','Ready to proceed'],['not_eligible','Not Eligible for Now'],['temporarily_ineligible','Not Eligible for Now'],['needs_further_screening','Not Eligible for Now']]){
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
 for(let i=0;i<screen.QUESTIONS.length;i++)assert.equal(summaryValue(statusView(),(i+1)+'. '+screen.QUESTIONS[i].text),i<5?'Yes':'No');
 ui.state={...inactive,assessment:null,next_allowed_at:null};ui.canSubmit=true;ui.error='';
 let empty=statusView();
 assert.match(texts(empty),/Pre-screening unavailable/);
 assert.match(texts(empty),/Donor Summary/);
 assert.equal(mascot(empty),'../../../assets/images/HappyMascot.png');
 assert.equal(summaryValue(empty,'Assessed'),'Not assessed');
 assert.equal(summaryValue(empty,'Next self-assessment available'),'Not available');
 assert.equal((texts(empty).match(/Not recorded/g)||[]).length,10);
 button(empty,'Start Assessment').props.onPress();assert.equal(routes.pop(),'/evaluation');
 const detailed={...assessment,result:'not_eligible',reasons:['First server reason','Second server reason'],answers:{
   weight:62,sleepHours:1,currentSymptoms:'YES',donatedWithinThreeMonths:'NO',feelsWell:'YES',currentlyPregnant:'NOT_APPLICABLE',
   takingAntibioticsForActiveInfection:'NO',stillRecoveringFromProcedure:'YES',activeOrRecoveringInfection:'NO',weakDizzyOrUnusuallyTired:'YES'
 }};
 ui.state={...active,assessment:detailed};ui.canSubmit=false;
 const detail=statusView();
 assert.match(texts(detail),/Not Eligible for Now/);assert.match(texts(detail),/First server reason/);assert.match(texts(detail),/Second server reason/);
 // Preserve the sad mascot already supplied and wired before this cleanup.
 const countdowns=tree=>nodes(tree).filter(n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.startsWith('Available again in '));
 assert.equal(countdowns(empty).length,0);
 assert.equal(countdowns(detail).length,1);
 assert.equal(countdowns(detail)[0].props.children,'Available again in 2m');
 const actionArea=nodes(detail).find(n=>n.type==='View'&&Array.isArray(n.props.children)&&n.props.children[0]===button(detail,'Update Status with Flowie'));
 assert.ok(actionArea);assert.equal(actionArea.props.children[1],countdowns(detail)[0]);
 assert.ok(!/Evaluation completed recently|Evaluate again in|Next self-assessment available:/.test(texts(detail)));
 ui.remaining=83880;assert.equal(countdowns(statusView())[0].props.children,'Available again in 23h 18m');ui.remaining=120;
 // Seconds in the server timestamp must not appear in displayed summary dates.
 ui.state={...active,assessment:{...detailed,assessed_at:'2026-09-12T00:00:37Z'},next_allowed_at:'2026-09-13T00:00:37Z'};
 assert.equal(summaryValue(statusView(),'Assessed'),summaryValue(detail,'Assessed'));
 assert.equal(summaryValue(statusView(),'Next self-assessment available'),summaryValue(detail,'Next self-assessment available'));
 ui.state={...active,assessment:detailed};
 assert.equal(mascot(detail),'../../../assets/images/SadMascot.png');
 assert.equal(summaryValue(detail,'Assessed'),new Date(assessment.assessed_at).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}));
 assert.equal(summaryValue(detail,'Next self-assessment available'),new Date(active.next_allowed_at).toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}));
 for(const [label,value] of [
 ['1. Weight','62 kg'],['2. Sleep last night','1 hour'],['3. Current symptoms','Yes'],
 ['4. Donated within the last 3 months','No'],['5. Feel well enough today','Yes'],['6. Currently pregnant','Not applicable'],
 ['7. Taking antibiotics for an active infection','No'],['8. Still recovering from surgery / procedure / hospitalization','Yes'],
 ['9. Active infection / recovering from one','No'],['10. Weak, dizzy, unusually tired, or physically unwell','Yes']])assert.equal(summaryValue(detail,label),value);
 assert.ok(!/Next Eligibility|Eligible again at|Medical clearance date/.test(texts(detail)));
 assert.match(texts(detail),/This is a pre-screening only/);
 ui.remaining=0;assert.equal(button(statusView(),'Update Status with Flowie').props.disabled,true);
 ui.remaining=120;ui.state={...active,assessment:{...detailed,result:'eligible',reasons:[],answers:{...detailed.answers,sleepHours:7}}};
 assert.equal(summaryValue(statusView(),'2. Sleep last night'),'7 hours');
 assert.equal(mascot(statusView()),'../../../assets/images/HappyMascot.png');
 assert.ok(!nodes(statusView()).some(n=>n.type==='Text'&&n.props.children==='Reason'));
 ui.state=active;
 assert.equal(summaryValue(statusView(),'7. Taking antibiotics for an active infection'),'Not recorded');
 assert.equal(summaryValue(statusView(),'6. Currently pregnant'),'Not recorded');
 ui.state={...active,assessment:{...detailed,assessed_at:'invalid',answers:{...detailed.answers,weight:null,sleepHours:undefined}}};
 assert.equal(summaryValue(statusView(),'Assessed'),'Not recorded');
 assert.equal(summaryValue(statusView(),'1. Weight'),'Not recorded');
 ui.error='Offline';ui.canSubmit=false;
 assert.equal(mascot(statusView()),'../../../assets/images/HappyMascot.png');
 assert.equal(button(statusView(),'Update Status with Flowie').props.disabled,true);
 ui.error='';ui.state=active;
 let tree=statusView();assert.match(texts(tree),/Ready to proceed/);assert.match(texts(tree),/Available again in 2m/);
 const update=button(tree,'Update Status with Flowie');assert.equal(update.props.disabled,true);update.props.onPress();assert.equal(routes.length,0);
 ui.state=inactive;ui.canSubmit=true;tree=statusView();assert.equal(countdowns(tree).length,0);assert.equal(button(tree,'Update Status with Flowie').props.disabled,false);button(tree,'Update Status with Flowie').props.onPress();assert.equal(routes.pop(),'/flowie');
 ui.canSubmit=false;ui.error='Offline';tree=statusView();const before=reloads;await button(tree,'Retry availability check').props.onPress();assert.equal(reloads,before+1);
 const flowie=load('src/services/flowie-preview.ts');assert.equal(flowie.flowieAction('open_evaluation').route,'/evaluation');
 console.log('Eligibility checks passed: ten-question wizard, review/edit, exact payload, all results, legacy history display, cooldown, concurrency guards, recovery, Status and Flowie.');
})().catch(e=>{console.error(e);process.exitCode=1;});

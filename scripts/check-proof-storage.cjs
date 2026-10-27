const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { __DEV__: false, module, exports: module.exports, require: name => {if (name === '@/constants/theme') return load('src/constants/theme.ts', {'react-native': {Platform: {select: options => options.default}}});
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, ...globals });
  return module.exports;
}


/* Private multipart contract checks. No network, Firebase or device is used. */
class ApiError extends Error { constructor(message,status=0,fields={}){super(message);this.status=status;this.fields=fields;} }
async function main(){
 let platform='android',canceled=false,pickerOptions;
 let picked={type:'image/jpeg',size:100,name:'proof.jpg',bytes:()=>{throw Error('Must not read bytes manually');}};
 const logs=[];
 class Form {entries=[];append(...args){this.entries.push(args);} }
 const service=load('src/services/proof-storage.ts',{
  'expo-file-system':{File:class{constructor(){throw Error('Do not recreate picked File');}static async pickFileAsync(options){pickerOptions=options;return {canceled,result:canceled?null:picked};}}},
  'expo-document-picker':{getDocumentAsync:async()=>{assert.equal(platform,'web');return {canceled,assets:[{file:picked}]};}},
  'react-native':{Platform:{get OS(){return platform;}}},
  './api':{ApiError}
 },{FormData:Form,__DEV__:true,console:{error:(...args)=>logs.push(args)}});
 for(const type of ['image/jpeg','image/png','application/pdf']){
  picked={...picked,type};
  const file=await service.pickProofFile();assert.equal(file,picked);
  assert.equal(pickerOptions.mimeTypes.join(','),'image/jpeg,image/png,application/pdf');assert.equal(pickerOptions.multipleFiles,false);
  const upload=service.prepareProofUpload(file);assert.equal(upload.entries[0][0],'proof');assert.equal(upload.entries[0][1],picked);assert.equal(upload.entries[0].length,2);
 }
 canceled=true;assert.equal(await service.pickProofFile(),null);canceled=false;
 picked.size=5*1024*1024;service.prepareProofUpload(picked);
 picked.size++;await assert.rejects(service.pickProofFile(),/5 MB/);
 picked.size=0;assert.throws(()=>service.prepareProofUpload(picked),/non-empty/);
 picked.size=100;picked.type='text/plain';await assert.rejects(service.pickProofFile(),/JPEG/);
 picked.type='image/png';platform='web';
 assert.equal(await service.pickProofFile(),picked);assert.equal(service.prepareProofUpload(picked).entries[0][1],picked);
 canceled=true;assert.equal(await service.pickProofFile(),null);
 service.reportProofFailure(new ApiError('SECRET filename and token',422,{proof:['SECRET']}));
 assert.ok(JSON.stringify(logs).includes('422'));assert.ok(!JSON.stringify(logs).includes('SECRET'));
 let request;
 const donations=load('src/services/donations.ts',{'./api':{apiRequest:async(path,options)=>{request={path,options};}}},{FormData:Form});
 const form=new Form();await donations.donationApi.proof('private','34',form);
 assert.equal(request.path,'/donation-participations/34/proof');assert.equal(request.options.body,form);assert.equal(request.options.method,'POST');assert.equal(request.options.timeoutMs,120000);
 let sent,expoCalls=0,jsonCalls=0,transportFailure;
 const expoFetch=async(url,options)=>{expoCalls++;sent=options;if(transportFailure)throw transportFailure;return {ok:true,json:async()=>({})};};
 const api=load('src/services/api.ts',{'expo/fetch':{fetch:expoFetch}}, {process:{env:{}},__DEV__:true,FormData:Form,AbortController,setTimeout,clearTimeout,
  fetch:async(url,options)=>{jsonCalls++;sent=options;return {ok:true,json:async()=>({})};}});
 await api.apiRequest('/proof',{token:'private',method:'POST',body:form,timeoutMs:120000});
 assert.equal(expoCalls,1);assert.equal(jsonCalls,0);
 assert.equal(sent.body,form);assert.equal(sent.headers['Content-Type'],undefined);assert.equal(sent.headers.Authorization,'Bearer private');
 assert.ok(sent.signal instanceof AbortSignal);
 await api.apiRequest('/normal',{method:'POST',body:{hello:'world'}});
 assert.equal(expoCalls,1);assert.equal(jsonCalls,1);
 assert.equal(sent.body,JSON.stringify({hello:'world'}));assert.equal(sent.headers['Content-Type'],'application/json');
 transportFailure=new Error('Network request failed: file:///private/SECRET.pdf Bearer SECRET');
 await assert.rejects(api.apiRequest('/proof',{token:'private',method:'POST',body:form}),e=>{
  assert.equal(e.status,0);assert.equal(e.transportName,'Error');assert.ok(e.transportMessage.includes('Network request failed'));assert.ok(!e.transportMessage.includes('SECRET'));
  assert.ok(!e.message.includes('SECRET'));return true;
 });
 transportFailure=new TypeError('Cannot convert undefined value to object');
 await assert.rejects(api.apiRequest('/proof',{token:'private',method:'POST',body:form}),e=>{
  assert.equal(e.transportName,'TypeError');assert.equal(e.transportMessage,'Cannot convert undefined value to object');return true;
 });

 transportFailure=new Error('NativeRequest.start rejected; response body: SECRET PRIVATE CONTENT');
 await assert.rejects(api.apiRequest('/proof',{token:'private',method:'POST',body:form}),e=>{
  assert.ok(e.transportMessage.includes('NativeRequest.start rejected'));assert.ok(!e.transportMessage.includes('SECRET'));return true;
 });

 form.entries=function*(){yield ['proof',{name:'donor evidence.pdf',uri:'file:///data/cache/donor%20evidence.pdf'}];};
 transportFailure=new Error('Native conversion failed for donor evidence.pdf at file:///data/cache/donor%20evidence.pdf using secret-login-token');
 await assert.rejects(api.apiRequest('/proof',{token:'secret-login-token',method:'POST',body:form}),e=>{
  assert.ok(e.transportMessage.includes('Native conversion failed'));
  assert.ok(!/donor|file:\/\/\/|secret-login-token/.test(e.transportMessage));return true;
 });
 const production=load('src/services/api.ts',{'expo/fetch':{fetch:expoFetch}}, {process:{env:{}},__DEV__:false,FormData:Form,AbortController,setTimeout,clearTimeout});
 await assert.rejects(production.apiRequest('/proof',{token:'private',method:'POST',body:form}),e=>e.transportName===undefined && e.transportMessage===undefined);
 assert.ok(!fs.readFileSync('src/services/proof-storage.ts','utf8').includes('firebase'));
 assert.ok(!fs.existsSync('src/services/firebase.ts'));
 console.log('PASS: native/web multipart files, MIME/size checks, private API payload, automatic boundary, sanitized development diagnostics, no Storage imports');
}
async function screenChecks(reconciled=false, cancelled=false, needsRevision=false, finalStatus=null, duration=200, cleanupPhase=null, cancelAction=false) {
  const slots = []; let cursor = 0; let focused = false; let focus;
  const stateWrites = [], timers = new Map(), delays = [];
  let now = 0, timerId = 0;
  let uploads = 0; let submissions = 0; let finishSave; let finishFailure; let cancellations=0;
  let failSave = false; let finishReconciliation;
  const pending = { id: 34, status: finalStatus || (needsRevision?'needs_revision':'pending'), revision_reason:'Please upload a clearer image.', rejection_reason:'Invalid certificate.', proof_original_name:finalStatus||needsRevision?'IMG_20260928_114941.jpg':null, opportunity: { title: 'Drive', points_reward: 300 } };
  let selected = 0;
  const jsx = (type, props) => typeof type==='function'?type(props):({ type, props });
  const native={ Alert: { alert() {} }, Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: x => x }, Text: 'Text', View: 'View' };
  const presentation=load('src/services/announcement-presentation.ts',{'./api':{API_BASE_URL:'http://api.test/api'}},{URL});
  const body=load('src/components/announcement-body.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native});
  const screen = load('src/app/activity/[id].tsx', {
    '@/components/tab-skeleton': { TabSkeleton: 'TabSkeleton' },
    '@expo/vector-icons/MaterialIcons': { __esModule:true, default: 'Icon' },
    'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => ({ back() {} }), useLocalSearchParams: () => ({ id: '34' }), useFocusEffect: fn => { if (!focused) { focused = true; focus = fn; } } },
    react: {
      useCallback: fn => fn,
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { stateWrites.push(i); slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': native,
    '@/components/announcement-body':body,
    '@/services/announcement-presentation':presentation,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
    '@/contexts/auth-context': { useAuth: () => ({ user: { id: 12 }, donationDetail: async () => {if(submissions && failSave)return new Promise(resolve=>{finishReconciliation=()=>resolve({participation:pending});});return {participation:pending};}, cancelParticipation: async () => {cancellations++;return {participation:{...pending,status:'cancelled'}};}, submitProof: async () => {
      submissions++; if (failSave) return new Promise((_resolve,reject)=>{finishFailure=()=>{if(reconciled)pending.status='for_verification';reject(new Error('Offline'));};});
      return new Promise(resolve => { finishSave = () => resolve({ participation: { ...pending, status: 'for_verification' } }); });
    } }) },
    '@/services/api': { ApiError,errorMessage: error => error.message },
    '@/services/donations': { DONATION_STATUS: { pending: 'Pending', for_verification: 'For Verification', needs_revision: 'Needs Revision', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' } },
    '@/services/proof-storage': { pickProofFile: async () => { selected++; return cancelled ? null : {}; }, prepareProofUpload: () => { uploads++; return {}; }, reportProofFailure() {} },
    '@/components/proof-submission-loading': { ProofSubmissionLoading: ({phase}) => jsx('Modal', {visible:true,transparent:true,animationType:'none',onRequestClose(){},children:jsx('ProofLoading',{phase})}) },
  }, {
    Date: { now: () => now },
    setTimeout: (callback, delay) => { const id=++timerId; delays.push(delay); timers.set(id,{callback,due:now+delay}); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const render = () => { cursor = 0; return screen.default(); };
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && nodes(n.props.children).some(child => child.type === 'Text' && child.props.children === label));
  const loading = tree => nodes(tree).find(n=>n.type==='Modal');
  const checkLoading = (tree, expectSubmit=true) => {
    const modal=loading(tree);assert.ok(modal);assert.equal(modal.props.visible,true);
    assert.equal(modal.props.transparent,true);assert.equal(modal.props.animationType,'none');
    assert.ok(nodes(modal).some(n=>n.type==='ProofLoading' && ['uploading','checking'].includes(n.props.phase)));
    const submit=button(tree,'Retry Proof Upload');
    if(expectSubmit){assert.ok(submit);assert.equal(submit.props.disabled,true);assert.equal(submit.props.accessibilityState.busy,true);}
    modal.props.onRequestClose();assert.ok(loading(render()),'Back cannot dismiss an unfinished upload');
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const advance = async milliseconds => {
    now+=milliseconds;
    for(const [id,timer] of timers){if(timer.due<=now){timers.delete(id);timer.callback();}}
    await flush();
  };
  const finishPromptly = async () => {
    await flush();
    assert.equal(loading(render()),undefined,'No minimum-display or video-duration wait');
    assert.equal(timers.size,0);assert.equal(delays.length,0);
  };
  render(); const cleanup=focus(); await flush();
  assert.equal(loading(render()),undefined);
  if(cancelAction){
    const confirmation=()=>nodes(render()).find(n=>n.type==='ConfirmationModal').props;
    button(render(),'Cancel Participation').props.onPress();
    assert.equal(cancellations,0);assert.equal(confirmation().visible,true);
    assert.equal(confirmation().secondaryLabel,'Keep activity');assert.equal(confirmation().primaryLabel,'Cancel participation');
    assert.equal(confirmation().dismissible,false);
    confirmation().onSecondary();assert.equal(confirmation().visible,false);assert.equal(cancellations,0);
    button(render(),'Cancel Participation').props.onPress();const accept=confirmation().onPrimary;
    accept();accept();await flush();assert.equal(cancellations,1);assert.equal(submissions,0);
    assert.ok(nodes(render()).some(n=>n.props?.children==='Cancelled.'));assert.equal(button(render(),'Cancel Participation'),undefined);
    return;
  }
  if(finalStatus){
    const expected={for_verification:'For Verification.',completed:'Donation Verified.',rejected:'Rejected.',cancelled:'Cancelled.'}[finalStatus];
    assert.ok(nodes(render()).some(n=>n.props?.children===expected));
    assert.ok(!nodes(render()).some(n=>n.props?.children===pending.proof_original_name));
    if(finalStatus==='rejected'){
      assert.ok(nodes(render()).some(n=>n.props?.children==='Reason:'));
      assert.ok(nodes(render()).some(n=>n.props?.children===pending.rejection_reason));
    }else assert.ok(!nodes(render()).some(n=>n.props?.children==='Reason:'));
    assert.equal(button(render(),'Upload Proof'),undefined);
    assert.equal(button(render(),'Upload New Proof'),undefined);
    assert.equal(button(render(),'Re-upload Proof'),undefined);
    assert.equal(submissions,0);
    return;
  }
  const upload = button(render(), needsRevision?'Re-upload Proof':'Upload Proof');
  if(needsRevision){assert.ok(nodes(render()).some(n=>n.props?.children==='Please upload a clearer image.'));assert.equal(button(render(),'Cancel Participation'),undefined);}
  failSave = cleanupPhase!=='success';
  upload.props.onPress(); upload.props.onPress(); await flush();
  if(cancelled){assert.equal(submissions,0);assert.ok(button(render(), 'Upload Proof'));return;}
  checkLoading(render());
  assert.equal(now,0);assert.equal(timers.size,0,'Network request starts before any display-delay timer');
  assert.equal(submissions,1);button(render(),'Retry Proof Upload').props.onPress();await flush();
  assert.equal(submissions,1,'Duplicate taps while the mascot is visible do not resubmit');
  checkLoading(render());
  if(cleanupPhase==='success'){
    cleanup();const writes=stateWrites.length;
    finishSave();await flush();
    assert.equal(stateWrites.length,writes,'No stale state updates after leaving before upload success');
    assert.equal(timers.size,0);return;
  }
  if(cleanupPhase==='network'){
    cleanup();const writes=stateWrites.length;
    finishFailure();await flush();await advance(1000);
    assert.equal(timers.size,0);assert.equal(delays.length,0);
    assert.equal(stateWrites.length,writes,'No stale state updates after leaving during upload');
    return;
  }
  await advance(duration);
  finishFailure();await flush();
  checkLoading(render(),!reconciled);
  assert.ok(nodes(render()).some(n=>n.type==='ProofLoading' && n.props.phase==='checking'),'Keep checking state during lost-response reconciliation');
  upload.props.onPress();await flush();assert.equal(submissions,1,'Keep duplicate-submit lock during reconciliation');
  if(cleanupPhase==='reconciliation'){
    cleanup();const writes=stateWrites.length;
    finishReconciliation();await flush();
    assert.equal(stateWrites.length,writes,'No stale state updates after leaving during reconciliation');
    assert.equal(timers.size,0);assert.equal(delays.length,0);
    return;
  }
  finishReconciliation();await finishPromptly();
  assert.equal(loading(render()),undefined,'Failed requests close the overlay');
  if(reconciled){assert.equal(submissions,1);assert.equal(button(render(), 'Cancel Participation'),undefined);return;}
  assert.equal(uploads, 1);
  assert.equal(selected, 1);
  assert.equal(submissions, 1);
  assert.ok(nodes(render()).some(n => n.props?.children === (needsRevision?'Needs Revision':'Pending')));
  const retry = button(render(), 'Retry Proof Upload');
  assert.ok(retry);
  assert.equal(retry.props.disabled,false);assert.ok(nodes(render()).some(n=>n.type==='Text'&&String(n.props.children).includes('Offline')));
  failSave = false; retry.props.onPress(); await flush();
  assert.equal(uploads, 2);
  assert.equal(selected, 1);
  assert.equal(submissions, 2);
  checkLoading(render());retry.props.onPress();await flush();assert.equal(submissions,2);
  if(!needsRevision)assert.equal(button(render(), 'Cancel Participation').props.disabled, true);
  assert.ok(nodes(render()).some(n => n.props?.children === (needsRevision?'Needs Revision':'Pending')));
  await advance(duration);
  finishSave(); await flush();
  await finishPromptly();
  assert.equal(loading(render()),undefined,'Successful requests close the overlay');
  assert.ok(nodes(render()).some(n => n.props?.children === 'For Verification'));
  assert.equal(button(render(), 'Cancel Participation'), undefined);
  console.log(`PASS: ${needsRevision?'resubmission':'upload'} ${duration} ms success/failure, prompt close without timers, immediate request, duplicate lock, cached retry, presentation isolation`);
}
async function activityUiChecks(){
 const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
 const native={Image:'Image',Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:x=>x}};
 const runtime={jsx,jsxs:jsx,Fragment:'Fragment'};
 const body=load('src/components/announcement-body.tsx',{'react/jsx-runtime':runtime,'react-native':native});
 const presentation=load('src/services/announcement-presentation.ts',{'./api':{API_BASE_URL:'http://api.test/api'}},{URL});
 const rich={version:1,blocks:[{type:'paragraph',content:[{text:'Real formatted event',bold:true,italic:true}]},
   {type:'bullet_list',items:[[{text:'Bring identification'}]]},{type:'ordered_list',items:[[{text:'First instruction'}],[{text:'Second instruction'}]]}]};
 const fixture={id:34,status:'pending',proof_uploaded_at:null,proof_original_name:null,proof_size:null,verified_at:null,
   revision_reason:null,rejection_reason:null,opportunity:{title:'A real event title',event_date:'2026-10-20',start_time:'09:30:00',end_time:'15:00:00',
     location:'Actual venue',description:'Plain event details',description_document:rich,points_reward:9999}};
 const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
 const texts=tree=>nodes(tree).filter(n=>n.type==='Text').map(n=>Array.isArray(n.props.children)?n.props.children.join(''):n.props.children).join('\n');
 const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&texts(n)===label);
 const appearance=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
 async function screen({record=fixture,id='34',failure=null,response=null,development=false}={}){
   const slots=[],queue=[],calls=[],routes=[];let cursor=0,focusFn,focusCleanup,current=record,requestFailure=failure,customResponse=response;
   const react={
     useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
     useRef:initial=>{const i=cursor++;return slots[i]||={current:initial};},
     useCallback:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((value,index)=>value!==old.deps[index]))slots[i]={deps,fn};return slots[i].fn;},
   };
   const auth={user:{id:12},donationDetail:async key=>{calls.push(['load',key]);if(requestFailure)throw requestFailure;return customResponse||{participation:current};},
     cancelParticipation:async key=>{calls.push(['cancel',key]);throw new ApiError('Cancellation failed. Please retry.',409);},
     submitProof:async()=>{calls.push(['proof']);throw Error('Unexpected proof submission');}};
   const module=load('src/app/activity/[id].tsx',{
     '@/components/tab-skeleton':{TabSkeleton:'TabSkeleton'},
     '@expo/vector-icons/MaterialIcons':{__esModule:true,default:'Icon'},'react/jsx-runtime':runtime,react,'react-native':native,
     'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'@/components/confirmation-modal':{ConfirmationModal:'ConfirmationModal'},
     '@/components/announcement-body':body,'@/services/announcement-presentation':presentation,
     'expo-router':{Stack:{Screen:'Screen'},useRouter:()=>({back:()=>routes.push('back')}),useLocalSearchParams:()=>({id}),
       useFocusEffect:fn=>{if(fn!==focusFn){focusFn=fn;queue.push(()=>{focusCleanup?.();focusCleanup=fn();});}}},
     '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{ApiError,errorMessage:e=>e.message},
     '@/services/donations':{DONATION_STATUS:{pending:'Pending',for_verification:'For Verification',needs_revision:'Needs Revision',completed:'Completed',rejected:'Rejected',cancelled:'Cancelled'}},
     '@/services/proof-storage':{pickProofFile:async()=>{calls.push(['picker']);throw new ApiError('Choose a JPEG, PNG, or PDF proof.');},prepareProofUpload:()=>{throw Error('No valid file selected');},reportProofFailure(){}},
     '@/components/proof-submission-loading':{ProofSubmissionLoading:'ProofLoading'},
   },{__DEV__:development,setTimeout,clearTimeout});
   const view=()=>{cursor=0;const tree=module.default();while(queue.length)queue.shift()();return tree;};
   const initial=view();const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush();
   return {view,initial,auth,calls,routes,flush,close:()=>focusCleanup?.(),update:value=>{current=value;customResponse=null;requestFailure=null;},
     fail:value=>{requestFailure=value;},respond:value=>{customResponse=value;requestFailure=null;},route:value=>{id=value;},
     refocus:()=>{focusCleanup?.();focusCleanup=focusFn();}};
 }
 for(const status of ['pending','for_verification','needs_revision','completed','rejected','cancelled','unknown-status','__proto__']){
   const record={...fixture,status,revision_reason:status==='needs_revision'?'Please upload a clearer certificate.':null,
     rejection_reason:status==='rejected'?'This certificate cannot be accepted.':null,
     proof_uploaded_at:status==='pending'?null:'2026-10-20T05:00:00Z',proof_original_name:status==='pending'?null:'PRIVATE_proof_name.jpg',
     verified_at:status==='completed'?'2026-10-21T02:30:00Z':null};
   const s=await screen({record}),tree=s.view(),copy=texts(tree),all=nodes(tree);
   const known=!['unknown-status','__proto__'].includes(status);
   assert.equal(all.find(n=>n.type==='SafeAreaView').props.style.backgroundColor,'#FFF9F2');
   assert.deepEqual(Array.from(all.find(n=>n.type==='SafeAreaView').props.edges),['top','right','bottom','left']);
   const banner=all.find(n=>n.props?.accessibilityLabel?.startsWith('Status: '));assert.ok(banner);assert.notEqual(appearance(banner.props.style).backgroundColor,'#000000');
   const palette=load('src/constants/theme.ts',{'react-native':{Platform:{select:options=>options.default}}});
   if(known){
     assert.equal(appearance(banner.props.style).backgroundColor,palette.DonationStatusColors[status].surface);
     assert.equal(all.find(n=>n.type==='Icon'&&n.props.name===({pending:'schedule',for_verification:'hourglass-empty',needs_revision:'error-outline',completed:'check-circle',rejected:'cancel',cancelled:'block'})[status]).props.color,palette.DonationStatusColors[status].text);
   }
   if(status==='needs_revision'){
     const upload=button(tree,'Re-upload Proof');
     assert.equal(appearance(upload.props.style({pressed:false})).backgroundColor,palette.LifeFlowColors.revisionAction);
     assert.equal(appearance(upload.props.style({pressed:true})).backgroundColor,palette.LifeFlowColors.revisionPressed);
   }
   assert.equal(appearance(banner.props.style).borderRadius,20);assert.ok(nodes(banner).some(n=>n.type==='Icon'));
   const has=label=>Boolean(button(tree,label));
   assert.equal(has('Upload Proof'),status==='pending');assert.equal(has('Re-upload Proof'),status==='needs_revision');assert.equal(has('Cancel Participation'),status==='pending');
   if(!known){assert.match(copy,/Status Unavailable/);assert.ok(has('Refresh activity'));}
   if(status==='for_verification'){assert.match(copy,/awaiting Admin review/);assert.match(copy,/Proof submitted: October 20, 2026/);assert.doesNotMatch(copy,/Please upload your donation proof/);}
   if(status==='completed'){assert.match(copy,/Donation Verified\./);assert.match(copy,/Verified on: October 21, 2026/);}
   if(['needs_revision','rejected'].includes(status))assert.ok(copy.includes(record[status==='needs_revision'?'revision_reason':'rejection_reason']));
   assert.doesNotMatch(copy,/PRIVATE_proof_name|9999|09:30:00|15:00:00/,'Private filename and estimated per-record awards are not displayed');
   for(const label of ['A real event title','October 20, 2026','9:30 AM – 3:00 PM','Actual venue','About the Event','Reward Points','300','50','500','Bring identification','1.','2.'])assert.ok(copy.includes(label),`${status}: ${label}`);
   const richText=all.find(n=>n.type==='Text'&&n.props.children==='Real formatted event');assert.equal(appearance(richText.props.style).fontWeight,'700');assert.equal(appearance(richText.props.style).fontStyle,'italic');
   const labels=all.filter(n=>n.type==='Text'&&n.props.accessibilityRole==='header').map(n=>n.props.children);
   assert.ok(labels.indexOf('Activity Details')<labels.indexOf('A real event title'));assert.ok(labels.indexOf('About the Event')<labels.indexOf('Reward Points'));
   assert.ok(copy.indexOf('Reward Points')<copy.indexOf(status==='needs_revision'?'Update Donation Proof':status==='pending'?'Upload Donation Proof':known?status==='completed'?'Donation Verified.':status==='rejected'?'Rejected.':status==='cancelled'?'Cancelled.':'For Verification.':'Activity Status Unavailable.'));
   assert.equal(all.filter(n=>n.type==='ScrollView').length,1);assert.ok(all.find(n=>n.type==='ScrollView').props.contentContainerStyle.paddingBottom>=32);
   for(const width of [320,375]){
     const bannerStyle=appearance(banner.props.style),contentStyle=all.find(n=>n.type==='View'&&appearance(n.props.style).borderLeftWidth===1).props.style;
     assert.equal(appearance(contentStyle).minWidth,0);assert.ok(width-32-2*bannerStyle.padding-48-bannerStyle.gap-14>100,'Banner text has flexible room at phone widths');
   }
   assert.ok(!all.some(n=>n.type==='Text'&&(n.props.numberOfLines||n.props.allowFontScaling===false)),'Dynamic content keeps font scaling and is not truncated');
   const back=all.find(n=>n.props?.accessibilityLabel==='Go back');assert.ok(appearance(back.props.style({pressed:false})).minHeight>=44);back.props.onPress();assert.equal(s.routes.pop(),'back');
   if(status==='pending'){
     button(tree,'Upload Proof').props.onPress();await s.flush();assert.match(texts(s.view()),/Choose a JPEG, PNG, or PDF proof/);assert.equal(s.calls.filter(c=>c[0]==='proof').length,0);assert.equal(nodes(s.view()).find(n=>n.type==='Modal'),undefined);
     button(s.view(),'Cancel Participation').props.onPress();const confirm=nodes(s.view()).find(n=>n.type==='ConfirmationModal').props.onPrimary;confirm();confirm();await s.flush();assert.equal(s.calls.filter(c=>c[0]==='cancel').length,1);assert.match(texts(s.view()),/Cancellation failed/);assert.ok(button(s.view(),'Cancel Participation'));
   }
   s.close();
 }
 let s=await screen({record:{...fixture,proof_uploaded_at:'2026-10-20T05:00:00Z',proof_original_name:'existing.jpg'}});
 assert.match(texts(s.view()),/Donation proof is already on file/);assert.ok(button(s.view(),'Upload New Proof'));assert.ok(button(s.view(),'Cancel Participation'));
 assert.doesNotMatch(texts(s.view()),/Please upload your donation proof/);s.close();
 for(const opportunity of [null,{}, {title:'',location:null,event_date:'2026-02-30',description:''}]){
   s=await screen({record:{...fixture,opportunity}});for(const label of ['Donation activity','Location to be announced','Date to be announced','Event details are no longer available.'])assert.ok(texts(s.view()).includes(label));s.close();
 }
 s=await screen({record:{...fixture,source_type:'red_cross_dagupan',opportunity:null}});assert.match(texts(s.view()),/Confirm arrangements with the chapter/);s.close();
 s=await screen({record:{...fixture,opportunity:{...fixture.opportunity,title:'Long activity title '.repeat(30),description:'Full description. '.repeat(200),description_document:{version:2}}}});
 assert.ok(nodes(s.view()).some(n=>n.type==='Text'&&n.props.children==='Full description. '.repeat(200)));s.close();
 for(const response of [{},{participation:null}]){s=await screen({response});assert.match(texts(s.view()),/This activity is unavailable/);assert.equal(button(s.view(),'Upload Proof'),undefined);s.close();}
 for(const id of [null,'bad-id','0']){s=await screen({id});assert.match(texts(s.view()),/This activity is unavailable/);assert.equal(s.calls.length,0);s.close();}
 for(const failure of [new ApiError('Not found',404),new ApiError('Offline. Please retry.')]){
   s=await screen({failure});assert.ok(nodes(s.view()).some(n=>n.props?.accessibilityRole==='alert'));assert.equal(button(s.view(),'Upload Proof'),undefined);
   s.update(fixture);button(s.view(),'Refresh activity').props.onPress();s.view();await s.flush();assert.ok(button(s.view(),'Upload Proof'));s.close();
 }
 s=await screen();
 const refresh={};refresh.promise=new Promise(resolve=>{refresh.resolve=resolve;});s.respond(refresh.promise);s.refocus();
 assert.match(texts(s.view()),/A real event title/);assert.ok(!nodes(s.view()).some(n=>n.type==='TabSkeleton'),'Same-record refocus retains content');
 assert.equal(button(s.view(),'Upload Proof').props.disabled,true);button(s.view(),'Upload Proof').props.onPress();await s.flush();assert.equal(s.calls.filter(c=>c[0]==='picker').length,0,'No cached actions before revalidation');
 refresh.resolve({participation:{...fixture,status:'for_verification',proof_uploaded_at:'2026-10-20T05:00:00Z'}});await s.flush();assert.match(texts(s.view()),/For Verification/);assert.equal(button(s.view(),'Upload Proof'),undefined);s.close();
 s=await screen();s.fail(new ApiError('Offline. Please retry.'));s.refocus();await s.flush();
 assert.match(texts(s.view()),/A real event title/);assert.match(texts(s.view()),/Offline/);assert.equal(button(s.view(),'Upload Proof').props.disabled,true);
 s.update(fixture);button(s.view(),'Refresh activity').props.onPress();s.view();await s.flush();assert.equal(button(s.view(),'Upload Proof').props.disabled,false);
 s.fail(new ApiError('Gone',404));s.refocus();await s.flush();assert.doesNotMatch(texts(s.view()),/A real event title/);assert.equal(button(s.view(),'Upload Proof'),undefined);s.close();
 for(const change of ['route','account']){
   s=await screen();const wait={};wait.promise=new Promise(resolve=>{wait.resolve=resolve;});s.respond(wait.promise);
   if(change==='route')s.route('35');else s.auth.user={id:99};
   const tree=s.view();assert.doesNotMatch(texts(tree),/A real event title/);assert.ok(nodes(tree).some(n=>n.type==='TabSkeleton'));assert.equal(button(tree,'Upload Proof'),undefined);
   s.close();wait.resolve({participation:fixture});await s.flush();assert.doesNotMatch(texts(s.view()),/A real event title/);
 }
 s=await screen({response:{participation:{...fixture,id:99}}});assert.match(texts(s.view()),/This activity is unavailable/);assert.equal(button(s.view(),'Upload Proof'),undefined);s.close();
 for(const development of [false,true]){
   s=await screen({development});
   assert.ok(!nodes(s.view()).some(n=>n.type==='Pressable' && /preview/i.test(texts(n))),'No development or production preview entry');
   assert.equal(nodes(s.view()).find(n=>n.type==='ProofLoading'),undefined,'Loading requires a real upload');
   s.close();
 }
 const late={};late.promise=new Promise(resolve=>{late.resolve=resolve;});s=await screen({response:late.promise});assert.ok(nodes(s.initial).some(n=>n.type==='TabSkeleton'&&n.props.label==='Loading activity'&&n.props.variant==='activity-detail'));s.close();late.resolve({participation:{...fixture,status:'completed'}});await s.flush();assert.doesNotMatch(texts(s.view()),/Donation Verified/);
 console.log('PASS: Task 04 light card hierarchy; all six statuses plus unknown/prototype-safe read-only fallbacks; pending with/without proof; real rich-text/date/location/reasons; no fabricated awards/private filenames; cancellation/invalid file/errors/empty/missing event/retry/refocus/stale load; narrow-screen/large-text configuration (mocked native boundaries)');
}
main().then(async()=>{
  for(const duration of [0,200,799,800,1500,5000,20000]){
    await screenChecks(false,false,false,null,duration);
    await screenChecks(false,false,true,null,duration);
  }
  await screenChecks(true);await screenChecks(false,true);await screenChecks(true,false,true);
  for(const status of ['for_verification','completed','rejected','cancelled'])await screenChecks(false,false,false,status);
  for(const phase of ['network','reconciliation','success'])await screenChecks(false,false,false,null,200,phase);
  await screenChecks(false,false,false,null,200,null,true);
  await activityUiChecks();
  console.log('PASS: reconciliation, picker cancellation, read-only statuses and loading/late-response cleanup on leaving');
})
  .catch(error => { console.error(error); process.exitCode = 1; });

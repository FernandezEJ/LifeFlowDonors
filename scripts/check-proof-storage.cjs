const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
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
  let failSave = false;
  const pending = { id: 34, status: finalStatus || (needsRevision?'needs_revision':'pending'), revision_reason:'Please upload a clearer image.', rejection_reason:'Invalid certificate.', proof_original_name:'IMG_20260928_114941.jpg', opportunity: { title: 'Drive', points_reward: 300 } };
  let selected = 0;
  const jsx = (type, props) => ({ type, props });
  const screen = load('src/app/activity/[id].tsx', {
    '@expo/vector-icons/MaterialIcons': { default: 'Icon' },
    'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => ({ back() {} }), useLocalSearchParams: () => ({ id: '34' }), useFocusEffect: fn => { if (!focused) { focused = true; focus = fn; } } },
    react: {
      useCallback: fn => fn,
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { stateWrites.push(i); slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Alert: { alert() {} }, Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: x => x }, Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/confirmation-modal': { ConfirmationModal: 'ConfirmationModal' },
    '@/contexts/auth-context': { useAuth: () => ({ user: { id: 12 }, donationDetail: async () => ({ participation: pending }), cancelParticipation: async () => {cancellations++;return {participation:{...pending,status:'cancelled'}};}, submitProof: async () => {
      submissions++; if (failSave) return new Promise((_resolve,reject)=>{finishFailure=()=>{if(reconciled)pending.status='for_verification';reject(new Error('Offline'));};});
      return new Promise(resolve => { finishSave = () => resolve({ participation: { ...pending, status: 'for_verification' } }); });
    } }) },
    '@/services/api': { errorMessage: error => error.message },
    '@/services/donations': { DONATION_STATUS: { pending: 'Pending', for_verification: 'For Verification', needs_revision: 'Needs Revision', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled' } },
    '@/services/proof-storage': { pickProofFile: async () => { selected++; return cancelled ? null : {}; }, prepareProofUpload: () => { uploads++; return {}; }, reportProofFailure() {} },
    '../../../assets/images/LogoMascot.png': 'LogoMascot',
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
    const content=nodes(modal),image=content.find(n=>n.type==='Image');
    assert.equal(image.props.source,'LogoMascot');assert.equal(image.props.fadeDuration,0);
    assert.equal(image.props.resizeMode,'contain');assert.ok(fs.existsSync('assets/images/LogoMascot.png'));
    const text=content.find(n=>n.type==='Text');
    assert.equal(text.props.children,'Flowie is submitting your proof...');assert.equal(text.props.style.textAlign,'center');
    assert.equal(text.props.accessibilityLiveRegion,'polite');
    const safeArea=content.find(n=>n.type==='SafeAreaView');
    assert.equal(safeArea.props.style.backgroundColor,'#FFF9F2');
    assert.equal(safeArea.props.style.alignItems,'center');assert.equal(safeArea.props.style.justifyContent,'center');
    assert.equal(safeArea.props.edges.join(','),'top,bottom');assert.equal(safeArea.props.accessibilityViewIsModal,true);
    assert.equal(safeArea.props.accessibilityState.busy,true);
    assert.ok(!content.some(n=>n.type==='Pressable'||n.type==='ActivityIndicator'||String(n.type).includes('Animated')));
    assert.ok(!nodes(tree).some(n=>['Uploading files...','Uploading proof...'].includes(n.props?.children)));
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
  const finishMinimum = async staleSubmit => {
    if(duration<800){
      assert.equal(delays.at(-1),800-duration,'Only the remaining minimum duration is scheduled');
      assert.equal(timers.size,1);
      checkLoading(render(),!reconciled && !nodes(render()).some(n=>n.props?.children==='For Verification'));
      await advance(799-duration);
      assert.ok(loading(render()),'Overlay remains visible until 800 ms total');
      const before=submissions;staleSubmit.props.onPress();await flush();
      assert.equal(submissions,before,'Submit lock remains active during the minimum-display wait');
      await advance(1);
    }else{
      assert.equal(timers.size,0,'Long uploads add no closing delay');
      assert.equal(delays.length,0,'No minimum-display timer for uploads lasting at least 800 ms');
    }
    assert.equal(loading(render()),undefined);
    assert.equal(timers.size,0);
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
    assert.equal(submissions,0);
    return;
  }
  const upload = button(render(), needsRevision?'Upload New Proof':'Upload Proof');
  if(needsRevision){assert.ok(nodes(render()).some(n=>n.props?.children==='Please upload a clearer image.'));assert.equal(button(render(),'Cancel Participation'),undefined);}
  failSave = true;
  upload.props.onPress(); upload.props.onPress(); await flush();
  if(cancelled){assert.equal(submissions,0);assert.ok(button(render(), 'Upload Proof'));return;}
  checkLoading(render());
  assert.equal(now,0);assert.equal(timers.size,0,'Network request starts before any display-delay timer');
  assert.equal(submissions,1);button(render(),'Retry Proof Upload').props.onPress();await flush();
  assert.equal(submissions,1,'Duplicate taps while the mascot is visible do not resubmit');
  checkLoading(render());
  if(cleanupPhase==='network'){
    cleanup();const writes=stateWrites.filter(i=>i===3).length;
    finishFailure();await flush();await advance(1000);
    assert.equal(timers.size,0);assert.equal(delays.length,0);
    assert.equal(stateWrites.filter(i=>i===3).length,writes,'No new overlay state updates after leaving during upload');
    return;
  }
  await advance(duration);
  finishFailure();await flush();
  if(cleanupPhase==='timer'){
    assert.equal(timers.size,1);cleanup();const writes=stateWrites.filter(i=>i===3).length;
    assert.equal(timers.size,0,'Leaving clears the pending minimum-display timer');
    await advance(1000);
    assert.equal(stateWrites.filter(i=>i===3).length,writes,'Cancelled wait does not update overlay state');
    assert.equal(slots[2],false,'Cancelled wait resolves and releases the existing submit lock');
    return;
  }
  await finishMinimum(upload);
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
  await finishMinimum(retry);
  assert.equal(loading(render()),undefined,'Successful requests close the overlay');
  assert.ok(nodes(render()).some(n => n.props?.children === 'For Verification'));
  assert.equal(button(render(), 'Cancel Participation'), undefined);
  console.log(`PASS: ${needsRevision?'resubmission':'upload'} ${duration} ms success/failure, 800 ms minimum only, immediate request, duplicate lock, cached retry, static mascot`);
}
main().then(async()=>{
  for(const duration of [0,200,799,800,1500,5000]){
    await screenChecks(false,false,false,null,duration);
    await screenChecks(false,false,true,null,duration);
  }
  await screenChecks(true);await screenChecks(false,true);await screenChecks(true,false,true);
  for(const status of ['for_verification','completed','rejected','cancelled'])await screenChecks(false,false,false,status);
  for(const phase of ['network','timer'])await screenChecks(false,false,false,null,200,phase);
  await screenChecks(false,false,false,null,200,null,true);
  console.log('PASS: reconciliation, picker cancellation, read-only statuses and display-timer cleanup on leaving');
})
  .catch(error => { console.error(error); process.exitCode = 1; });

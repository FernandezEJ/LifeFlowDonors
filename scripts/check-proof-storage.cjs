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
async function screenChecks(reconciled=false, cancelled=false, needsRevision=false) {
  const slots = []; let cursor = 0; let focused = false; let focus;
  let uploads = 0; let submissions = 0; let finishSave;
  let failSave = false;
  const pending = { id: 34, status: needsRevision?'needs_revision':'pending', revision_reason:'Please upload a clearer image.', opportunity: { title: 'Drive', points_reward: 300 } };
  let selected = 0;
  const jsx = (type, props) => ({ type, props });
  const screen = load('src/app/activity/[id].tsx', {
    '@expo/vector-icons/MaterialIcons': { default: 'Icon' },
    'expo-router': { Stack: { Screen: 'Screen' }, useRouter: () => ({ back() {} }), useLocalSearchParams: () => ({ id: '34' }), useFocusEffect: fn => { if (!focused) { focused = true; focus = fn; } } },
    react: {
      useCallback: fn => fn,
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Alert: { alert() {} }, Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: x => x }, Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/contexts/auth-context': { useAuth: () => ({ user: { id: 12 }, donationDetail: async () => ({ participation: pending }), cancelParticipation: async () => {}, submitProof: async () => {
      submissions++; if (failSave) { if(reconciled)pending.status='for_verification'; throw new Error('Offline'); }
      return new Promise(resolve => { finishSave = () => resolve({ participation: { ...pending, status: 'for_verification' } }); });
    } }) },
    '@/services/api': { errorMessage: error => error.message },
    '@/services/donations': { DONATION_STATUS: { pending: 'Pending', for_verification: 'For Verification', needs_revision: 'Needs Revision' } },
    '@/services/proof-storage': { pickProofFile: async () => { selected++; return cancelled ? null : {}; }, prepareProofUpload: () => { uploads++; return {}; }, reportProofFailure() {} },
  });
  const render = () => { cursor = 0; return screen.default(); };
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  const button = (tree, label) => nodes(tree).find(n => n.type === 'Pressable' && nodes(n.props.children).some(child => child.type === 'Text' && child.props.children === label));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  render(); focus(); await flush();
  const upload = button(render(), needsRevision?'Upload New Proof':'Upload Proof');
  if(needsRevision){assert.ok(nodes(render()).some(n=>n.props?.children==='Please upload a clearer image.'));assert.equal(button(render(),'Cancel Participation'),undefined);}
  failSave = true;
  upload.props.onPress(); upload.props.onPress(); await flush();
  if(cancelled){assert.equal(submissions,0);assert.ok(button(render(), 'Upload Proof'));return;}
  if(reconciled){assert.equal(submissions,1);assert.equal(button(render(), 'Cancel Participation'),undefined);return;}
  assert.equal(uploads, 1);
  assert.equal(selected, 1);
  assert.equal(submissions, 1);
  assert.ok(nodes(render()).some(n => n.props?.children === (needsRevision?'Needs Revision':'Pending')));
  const retry = button(render(), 'Retry Proof Upload');
  assert.ok(retry);
  failSave = false; retry.props.onPress(); await flush();
  assert.equal(uploads, 2);
  assert.equal(selected, 1);
  assert.equal(submissions, 2);
  if(!needsRevision)assert.equal(button(render(), 'Cancel Participation').props.disabled, true);
  assert.ok(nodes(render()).some(n => n.props?.children === (needsRevision?'Needs Revision':'Pending')));
  finishSave(); await flush();
  assert.ok(nodes(render()).some(n => n.props?.children === 'For Verification'));
  assert.equal(button(render(), 'Cancel Participation'), undefined);
  console.log('PASS: screen duplicate lock, pending until confirmation, cached-file retry, cancellation removed after success');
}
main().then(()=>screenChecks()).then(()=>screenChecks(true)).then(()=>screenChecks(false,true)).then(()=>screenChecks(false,false,true)).then(()=>screenChecks(true,false,true)).catch(error => { console.error(error); process.exitCode = 1; });

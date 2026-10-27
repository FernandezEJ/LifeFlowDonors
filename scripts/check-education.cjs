/* Runs the real B2 service and component handlers with mocked native boundaries. */
const assert = require('node:assert/strict');
const { load, host, nodes, native, shared, flush } = require('./flowie-test-boundaries.cjs');
const text = tree => nodes(tree).filter(node => node.type === 'Text').map(node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children).join(' ');
const deferred = () => { let resolve, reject;const promise = new Promise((a,b) => { resolve=a;reject=b; });return { promise, resolve, reject }; };
class ApiError extends Error { constructor(message,status=0) { super(message);this.status=status; } }
const document = { version:1, blocks:[{type:'paragraph',content:[{text:'Full test content',bold:true}]},{type:'bullet_list',items:[[{text:'Test list item',italic:true}]]}] };
const article = (id=1, extra={}) => ({ id,title:`Learning ${id}`,category:'blood_basics',category_label:'Blood Basics',short_description:'Short preview',description:'Full test content',description_document:document,image_url:`https://media.test/education/${id}.png`,status:'published',published_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z',...extra });
const page = (data=[], current=1,last=1) => ({data,meta:{current_page:current,last_page:last,total:data.length,per_page:20},categories:{blood_basics:'Blood Basics'}});
const education = load('src/services/educational-articles.ts', {'./api':{apiRequest:async()=>{}}});
const presentation = load('src/services/announcement-presentation.ts',{'./api':{API_BASE_URL:'http://device.test/api'}},{URL});
async function scenario({list=page(),detail={article:article()},width=360}={}) {
  const h=host(),timers=new Set(),calls=[];let foreground;
  const auth={user:{id:1},educationalArticles:async number=>{calls.push(['list',number]);return typeof list==='function'?list(number):list;},educationalArticle:async id=>{calls.push(['detail',id]);return typeof detail==='function'?detail(id):detail;}};
  const imports={...shared,react:h.react,'expo-router':{useFocusEffect:h.focus},
    'react-native':{...native,useWindowDimensions:()=>({width}),AppState:{addEventListener:(_,fn)=>{foreground=fn;return{remove(){foreground=null;}};}}},
    '@/contexts/auth-context':{useAuth:()=>auth},'@/services/api':{ApiError,errorMessage:e=>e.message},'@/services/educational-articles':education,'@/services/announcement-presentation':presentation,
    './announcement-image':{AnnouncementImage:'AnnouncementImage'},'./announcement-body':{AnnouncementBody:'AnnouncementBody'},'./load-state':{LoadError:'LoadError'},'./tab-skeleton':{TabSkeleton:'TabSkeleton'}};
  const component=load('src/components/did-you-know.tsx',imports,{setInterval:fn=>{timers.add(fn);return fn;},clearInterval:fn=>timers.delete(fn)});
  const view=()=>h.render(component.DidYouKnow),initial=view();await flush();
  return{view,initial,h,auth,calls,timers,poll:()=>[...timers].forEach(fn=>fn()),foreground:()=>foreground?.('active'),close:()=>h.unmount()};
}
const carousel=tree=>nodes(tree).find(node=>node.type==='FlatList');
const modal=tree=>nodes(tree).find(node=>node.type==='Modal');
const button=(tree,label)=>nodes(tree).find(node=>node.type==='Pressable'&&node.props.accessibilityLabel===label);

(async()=>{
  const calls=[],api=load('src/services/educational-articles.ts',{'./api':{apiRequest:async(path,options)=>{calls.push({path,options});return{};}}});
  await api.educationalArticlesApi.list('private',2);await api.educationalArticlesApi.detail('private',8);
  assert.deepEqual(calls.map(call=>call.path),['/educational-articles?page=2','/educational-articles/8']);assert.ok(calls.every(call=>call.options.token==='private'&&!call.options.method));
  assert.equal(presentation.publicImageUrl('/storage/education/test.png','education'),'http://device.test/storage/education/test.png');
  assert.equal(presentation.publicImageUrl('/storage/proofs/private.png','education'),null);
  let s=await scenario();assert.ok(nodes(s.initial).some(node=>node.type==='TabSkeleton'));assert.equal(s.view(),null,'No fabricated or empty educational panel');s.close();assert.equal(s.timers.size,0);
  for(const width of [320,360,768]){
    s=await scenario({list:page([article(),article(2),article(3,{status:'draft'}),article(4,{deleted_at:'2026-10-25'})]),width});
    const list=carousel(s.view());assert.equal(list.props.horizontal,true);assert.equal(list.props.snapToAlignment,'start');assert.equal(list.props.decelerationRate,'fast');assert.equal(list.props.data.length,2);
    const card=list.props.renderItem({item:article()});assert.equal(card.type,'Pressable');assert.equal(card.props.accessibilityRole,'button');assert.equal(nodes(card).filter(node=>node.type==='Pressable').length,1);
    assert.ok(nodes(card).some(node=>node.type==='AnnouncementImage'&&node.props.preview&&node.props.fallbackText==='No article image available'&&node.props.label==='Learning 1 article cover'));assert.ok(nodes(card).some(node=>node.type==='Icon'&&node.props.name==='chevron-right'));
    assert.equal(list.props.snapToInterval,Math.min(420,Math.max(220,width-72))+12);assert.equal(list.props.keyExtractor(article()),'1');
    const viewport=Math.min(560,width-40);list.props.onLayout({nativeEvent:{layout:{width:viewport}}});
    const measured=carousel(s.view()),padding=measured.props.contentContainerStyle[1].paddingRight,cardWidth=measured.props.snapToInterval-12;
    const endOffset=2*cardWidth+12+padding-viewport;
    assert.equal(endOffset,measured.props.snapToInterval,'Trailing space lets the final card align and activate its dot even on tablets');
    card.props.onPress();card.props.onPress();assert.equal(s.calls.filter(call=>call[0]==='detail').length,1);await flush();
    assert.equal(modal(s.view()).props.visible,true);assert.equal(modal(s.view()).props.animationType,'slide');
    const scrim=nodes(modal(s.view())).find(node=>node.type==='SafeAreaView');assert.equal(scrim.props.style.backgroundColor,'rgba(0,0,0,0.28)','Article sheet uses the shared neutral modal scrim');
    const body=nodes(s.view()).find(node=>node.type==='AnnouncementBody');assert.equal(body.props.document,document);assert.equal(body.props.description,'Full test content');
    assert.ok(nodes(s.view()).some(node=>node.type==='AnnouncementImage'&&!node.props.preview));assert.ok(!/Join|Go Donate|Event Date/.test(text(modal(s.view()))));
    modal(s.view()).props.onRequestClose();assert.equal(modal(s.view()).props.visible,false);
    list.props.onScroll({nativeEvent:{contentOffset:{x:list.props.snapToInterval}}});
    assert.ok(nodes(s.view()).some(node=>node.props?.accessibilityLabel==='Article 2 of 2'));
    assert.equal(button(s.view(),'Next educational article'),undefined);assert.equal(button(s.view(),'Previous educational article'),undefined);s.close();
  }
  const waiting=deferred();s=await scenario({list:page([article()]),detail:waiting.promise});carousel(s.view()).props.renderItem({item:article()}).props.onPress();
  assert.ok(nodes(modal(s.view())).some(node=>node.type==='TabSkeleton'));assert.ok(!nodes(modal(s.view())).some(node=>node.type==='AnnouncementBody'));
  button(s.view(),'Close article').props.onPress();waiting.resolve({article:article()});await flush();assert.equal(modal(s.view()).props.visible,false);assert.ok(!nodes(s.view()).some(node=>node.type==='AnnouncementBody'));s.close();
  let listResponse=page([article()]),detailResponse={article:article()},refreshes=0;
  s=await scenario({list:()=>{refreshes++;return listResponse;},detail:()=>detailResponse});carousel(s.view()).props.renderItem({item:article()}).props.onPress();await flush();
  listResponse=page([article(1,{title:'Edited title',image_url:'https://media.test/education/new.png'})]);detailResponse={article:article(1,{title:'Edited title',description_document:document})};s.poll();await flush();
  assert.match(text(s.view()),/Edited title/);assert.equal(carousel(s.view()).props.data[0].image_url,'https://media.test/education/new.png');assert.equal(refreshes,2);
  listResponse=Promise.reject(new Error('Offline'));detailResponse=Promise.reject(new ApiError('Gone',404));s.poll();await flush();
  assert.ok(!nodes(modal(s.view())).some(node=>node.type==='AnnouncementBody'),'An unavailable open article clears protected cached content');assert.ok(nodes(s.view()).some(node=>node.type==='LoadError'));button(s.view(),'Close article').props.onPress();s.close();
  let retryResponse=Promise.reject(new Error('Offline'));s=await scenario({list:()=>retryResponse});const error=nodes(s.view()).find(node=>node.type==='LoadError');assert.ok(error);assert.ok(!nodes(s.view()).some(node=>node.type==='TabSkeleton'));
  const retryWait=deferred();retryResponse=retryWait.promise;const beforeRetry=s.calls.length;
  error.props.onRetry();error.props.onRetry();assert.equal(s.calls.length,beforeRetry+1);retryWait.resolve(page([article()]));await flush();assert.equal(carousel(s.view()).props.data.length,1);
  retryResponse=page([article(1,{title:'Refocused title'})]);s.h.blur();s.h.refocus();await flush();assert.equal(carousel(s.view()).props.data[0].title,'Refocused title');s.close();
  for(const hidden of [article(1,{status:'draft'}),article(1,{deleted_at:'2026-10-25'}),article(9)]){
    s=await scenario({list:page([article()]),detail:{article:hidden}});carousel(s.view()).props.renderItem({item:article()}).props.onPress();await flush();assert.ok(!nodes(modal(s.view())).some(node=>node.type==='AnnouncementBody'));s.close();
  }
  const long=article(1,{title:'Long title '.repeat(20),short_description:'Long preview '.repeat(10),image_url:null,description:'Long content '.repeat(500)});
  s=await scenario({list:page([long]),detail:{article:long},width:320});const longCard=carousel(s.view()).props.renderItem({item:long});assert.equal(nodes(longCard).find(node=>node.type==='AnnouncementImage').props.uri,null);longCard.props.onPress();await flush();assert.ok(nodes(modal(s.view())).some(node=>node.type==='ScrollView'));assert.match(text(modal(s.view())),/Long title/);s.close();
  let reply=page([article()],1,2);s=await scenario({list:()=>reply});reply=page([article(2)],2,2);
  const more=carousel(s.view());more.props.onEndReached();more.props.onEndReached();await flush();assert.deepEqual(Array.from(carousel(s.view()).props.data,row=>row.id),[1,2]);assert.equal(s.calls.filter(call=>call[1]===2).length,1);
  reply=Promise.reject(new Error('Offline'));s.poll();await flush();assert.equal(carousel(s.view()).props.data.length,2,'Background failure retains safe published cards');
  const late=deferred();reply=late.promise;s.poll();s.close();late.resolve(page([article(9)]));await flush();assert.notEqual(carousel(s.view()).props.data[0].id,9);
  s=await scenario({list:page(Array.from({length:9},(_,i)=>article(i+1)))});
  for(const i of [0,1,2,3,4,5,6,7,8,7,4,1,0]){
    const list=carousel(s.view());list.props.onScroll({nativeEvent:{contentOffset:{x:i*list.props.snapToInterval}}});
    const tree=s.view(),dots=nodes(tree).find(node=>node.props?.accessibilityLabel===`Article ${i+1} of 9`);
    assert.ok(dots);const children=Array.from(dots.props.children);assert.equal(children.length,5);
    assert.ok(children.every(child=>child.type==='View'&&!child.props.onPress));
    const active=children.filter(child=>child.props.style[1]);assert.equal(active.length,1);
    assert.equal(active[0].props.style[1].width,20);assert.equal(active[0].props.style[1].backgroundColor,'#892325');
    const start=Math.max(0,Math.min(i-2,4));assert.equal(children.indexOf(active[0]),i-start,'Sliding dot window follows swipes in both directions');
    assert.equal(carousel(tree).props.data.length,9,'Dot cap never truncates articles');
    assert.doesNotMatch(text(tree),/\d+ of \d+|More articles|Next|Previous/);
    assert.equal(nodes(tree).filter(node=>node.type==='Pressable'&&node.props.accessibilityRole==='button').length,1,'Only article-sheet Close is a button outside rendered cards; no carousel buttons');
  }
  const last=carousel(s.view()).props.renderItem({item:carousel(s.view()).props.data[8]});last.props.onPress();await flush();assert.equal(s.calls.at(-1)[1],9);s.close();
  console.log('PASS B2/Step 5: protected API paths, published-only swipe carousel, 0/1/9 articles, capped sliding noninteractive dots in both directions, automatic guarded pagination, whole-card/single-open sheet, full rich content, Back/close, refresh/unavailability, offline Retry and late-response cleanup (native boundaries mocked).');
})().catch(error=>{console.error(error);process.exitCode=1;});

const {test}=require('node:test');const assert=require('node:assert/strict');const{createPreview}=require('../miniprogram/shared/preview');
test('objective preview follows paged shop-bound reads and cannot persist a draft',async()=>{
 const p=createPreview({}),shop=p.session.get().shop;
 const list=await p.api.action('objectives',{page:0,page_size:50});
 assert.equal(list.shop_id,shop.id);assert.equal(list.page,0);assert.equal(list.page_size,50);assert.equal(list.has_more,false);
 assert.equal(list.persisted,false);assert.equal(list.items[0].shop_id,shop.id);assert.match(list.items[0].title,/示例/);
 const row=await require('../miniprogram/pages/detail/objective').read(p.api,list.items[0].id,shop.id,()=>true);
 assert.ok(Array.isArray(row.key_results));assert.equal(typeof row.key_actions,'string');assert.ok(Date.parse(row.updated_at));
 const empty=await p.api.action('objectives',{page:1,page_size:50});assert.deepEqual(empty.items,[]);assert.equal(empty.page,1);
 await assert.rejects(p.api.action('objectives',{shop_id:'foreign'}),e=>e.status===403);
 await assert.rejects(p.api.action('objective-update',{id:row.id,key_actions:'不能保存'}));
});
test('preview retakes have distinct tokens and replies bind to the submitted attempt',async()=>{
 const p=createPreview({}),library=await p.api.action('my-library');
 const first=await p.api.action('quiz-start',{kind:'favorite',id:library.items[0].id});
 const second=await p.api.action('quiz-start',{kind:'favorite',id:library.items[1].id});
 assert.notEqual(first.quiz_token,second.quiz_token);
 assert.equal(first.attempt_id,first.quiz_token);assert.equal(second.attempt_id,second.quiz_token);
 const result=await p.api.action('quiz-submit',{quiz_token:first.quiz_token,answers:[1]});
 assert.equal(result.kind,'favorite');assert.equal(result.id,library.items[0].id);assert.equal(result.persisted,false);
 const next=await p.api.action('quiz-submit',{quiz_token:second.quiz_token,answers:[0]});
 assert.equal(next.id,library.items[1].id);assert.equal(next.persisted,false);
 await assert.rejects(p.api.action('quiz-submit',{quiz_token:'missing',answers:[1]}),e=>e.status===404);
});
test('development samples load without false live-sales or persistence',async()=>{const p=createPreview({});const data=await p.api.sales();assert.equal(data.achieved_cents,null);assert.equal(data.complete,false);assert.ok(data.as_of);const dashboard=await p.api.action('dashboard');assert.equal(dashboard.shift.title,'早班');const result=await p.api.action('quiz-submit',{});assert.equal(result.persisted,false);await assert.rejects(p.api.invoke('surprise-marketing-video',{}));});
test('SOP and QA preview preserve scope, Markdown and shared read-only details without writing',async()=>{
 const p=createPreview({}),shop_id=p.session.get().shop.id;
 for(const type of ['sop','qa']){
  const caps=await p.api.action('kb-capabilities',{shop_id,type});
  assert.equal(caps.shop_id,shop_id);assert.equal(caps.type,type);assert.equal(caps.can_write,true);
  assert.deepEqual(caps.limits,{title_chars:200,body_chars:40000,tags:20,tag_chars:40,query_chars:200});
  const list=await p.api.action('kb-list',{shop_id,type});
  assert.equal(list.type,type);assert.equal(list.page,0);assert.equal(list.has_more,false);assert.ok(list.as_of);
  assert.ok(list.items.some(row=>row.shop_id===shop_id));assert.ok(list.items.some(row=>row.shop_id===null));
  for(const row of list.items){
   assert.match(row.id,/^[0-9a-f-]{36}$/);assert.equal(row.type,type);assert.equal(row.body,undefined);assert.ok(row.body_preview.length<=400);
   const d=await p.api.action('kb-detail',{shop_id,type,id:row.id});
   assert.equal(d.entry.id,row.id);assert.equal(d.entry.type,type);assert.match(d.entry.title,/示例/);assert.match(d.version,/^[0-9a-f]{64}$/);
   assert.equal(d.can_edit,row.shop_id===shop_id);assert.equal(d.can_delete,row.shop_id===shop_id);
   assert.ok(d.entry.body.includes('**'));assert.ok(d.categories.every(c=>c.type===type&&(c.shop_id===shop_id||c.shop_id===null)));
  }
  const own=list.items.find(row=>row.shop_id===shop_id);
  if(type==='sop')assert.ok((await p.api.action('kb-detail',{shop_id,type,id:own.id})).entry.tags.includes('okr-highlight'));
  const filtered=await p.api.action('kb-list',{shop_id,type,q:own.title,page:0,page_size:1});assert.equal(filtered.items.length,1);assert.equal(filtered.query,own.title);
  assert.deepEqual((await p.api.action('kb-list',{shop_id,type,q:'% literal absent'})).items,[]);
  assert.deepEqual((await p.api.action('kb-list',{shop_id,type,page:1})).items,[]);
  await assert.rejects(p.api.action('kb-detail',{shop_id,type,id:'missing'}),e=>e.status===404);
  await assert.rejects(p.api.action('kb-write',{shop_id,type,operation:'create',title:'不能保存'}));
  await assert.rejects(p.api.action('kb-write-status',{shop_id,type,request_id:'missing'}));
 }
 await assert.rejects(p.api.action('kb-list',{shop_id:'foreign',type:'sop'}),e=>e.status===403);
 await assert.rejects(p.api.action('kb-list',{shop_id,type:'training'}),e=>e.status===400);
 await assert.rejects(p.api.action('kb-list',{shop_id,type:'sop',page:-1}),e=>e.status===400);
 await assert.rejects(p.api.action('kb-list',{shop_id,type:'sop',page_size:51}),e=>e.status===400);
});
test('preview never substitutes an unrelated article or claims a real check-in',async()=>{const p=createPreview({});await assert.rejects(p.api.action('knowledge-detail',{id:'missing'}),/不存在/);const data=await p.api.action('checkin-status');assert.equal(data.checked_today,false);assert.ok(Array.isArray(data.history.items));await assert.rejects(p.api.action('checkin-submit'));});
test('learning preview uses distinct favorite and result identities with explicit mastery and original content',async()=>{
 const p=createPreview({}), library=await p.api.action('my-library');
 assert.equal(library.page,0);assert.equal(library.has_more,false);
 assert.deepEqual(library.items.map(x=>x.passed),[false,true,false]);
 for(const row of library.items){
  assert.match(row.id,/^[0-9a-f-]{36}$/);assert.notEqual(row.id,row.source_id);assert.equal(row.quiz_kind,'favorite');
  const detail=await p.api.action('knowledge-detail',{kind:'favorite',id:row.id});
  assert.equal(detail.item.id,row.id);assert.equal(detail.item.kind,'favorite');assert.equal(detail.item.raw.favorite.id,row.id);
  assert.equal(detail.item.raw.source_available,true);assert.match(detail.item.body,/示例/);
 }
 const history=await p.api.action('quiz-history');assert.equal(history.items.length,2);
 assert.ok(history.items.every(r=>r.id!==r.item_id&&library.items.some(f=>f.id===r.item_id)));
 assert.equal(history.items[0].passed_at,null);assert.ok(history.items[1].passed_at);
 await assert.rejects(p.api.action('knowledge-detail',{kind:'favorite',id:'missing'}));
});
test('development quiz review stays synthetic and never changes archive or saves a real result',async()=>{
 const p=createPreview({}),before=await p.api.action('my-library');
 const started=await p.api.action('quiz-start',{kind:'favorite',id:before.items[0].id});
 assert.equal(started.questions[0].correct_answers,undefined);assert.equal(started.questions[0].correctIndex,undefined);
 const result=await p.api.action('quiz-submit',{quiz_token:started.quiz_token,answers:[1]});
 assert.equal(result.persisted,false);assert.equal(result.total,1);assert.deepEqual(result.correct,[true]);assert.deepEqual(result.correct_answers,[1]);
 assert.deepEqual((await p.api.action('my-library')).items.map(x=>x.passed),[false,true,false]);
});
test('continuous-practice preview uses the same three favorites and exact window metadata',async()=>{
 const p=createPreview({}), data=await p.api.action('practice-library');
 assert.equal(data.window_limit,300);assert.equal(data.has_older,false);assert.ok(Date.parse(data.as_of));
 assert.equal(data.items.length,3);assert.deepEqual(data.items.map(x=>x.id),(await p.api.action('my-library')).items.map(x=>x.id));
 const favorite=data.items.find(x=>!x.passed);const start=await p.api.action('quiz-start',{kind:'favorite',id:favorite.id});
 const result=await p.api.action('quiz-submit',{quiz_token:start.quiz_token,answers:[1]});
 assert.equal(result.kind,'favorite');assert.equal(result.id,favorite.id);assert.deepEqual(result.submitted,[1]);assert.equal(result.persisted,false);
 assert.equal((await p.api.action('practice-library')).items.find(x=>x.id===favorite.id).passed,false);
});
test('staff DM preview has separate synthetic contacts and history but never sends real messages', async()=>{
  const p=createPreview({});
  const contacts=await p.api.action('dm-contacts');
  assert.equal(contacts.items.length,1);
  assert.match(contacts.items[0].name,/示例/);
  const peer=contacts.items[0].user_id;
  const list=await p.api.action('dm-conversations');
  assert.equal(list.items[0].peer.user_id,peer);
  const history=await p.api.action('dm-messages',{peer_id:peer});
  assert.equal(history.order,'desc');
  assert.ok(history.items.every(m=>m.sender_id===peer||m.sender_id===p.session.get().userId));
  assert.ok(history.next_after);
  await assert.rejects(p.api.action('dm-send',{peer_id:peer,body:'不可以真实发送'}));
  await assert.rejects(p.api.uploadChatAttachment({path:'wxfile://a.png',kind:'image'}));
  await assert.rejects(p.api.openChatAttachment({}));
  await assert.rejects(p.api.action('dm-messages',{peer_id:'missing'}),/不存在/);
});
test('community preview reads an explicit sample without pretending to publish an interaction', async()=>{
  const p=createPreview({});
  const data=await p.api.action('community-detail',{id:'example-community'});
  assert.match(data.post.story,/示例/);
  assert.equal(typeof data.liked,'boolean');
  const comments=await p.api.action('community-comments',{post_id:'example-community'});
  assert.equal(comments.order,'asc');
  assert.ok(comments.items.every(c=>c.post_id==='example-community'));
  await assert.rejects(p.api.action('community-detail',{id:'missing'}),/不存在/);
  await assert.rejects(p.api.action('community-comment',{post_id:'example-community',content:'不能真实发表'}));
  await assert.rejects(p.api.action('community-like',{post_id:'example-community',liked:true}));
});
test('notification preview returns only explicitly confirmed loaded ids for the batch mode', async()=>{
  const p=createPreview({});
  const data=await p.api.action('notification-read',{ids:['example-shift','missing']});
  assert.deepEqual(data.read_ids,['example-shift']);
  assert.deepEqual(data.ignored_ids,['missing']);
  assert.equal(data.persisted,false);
  const list=await p.api.action('notifications');
  assert.equal(list.items.find(n=>n.id==='example-shift').read,true);
  assert.equal(list.items.find(n=>n.id==='example-training').read,false);
});
test('DM preview preserves opaque snapshots and only reports synthetic message receipt state', async()=>{
  const p=createPreview({});
  const list=await p.api.action('dm-conversations');
  assert.ok(list.snapshot_at);
  assert.equal((await p.api.action('dm-conversations',{snapshot_at:list.snapshot_at,page:1})).snapshot_at,list.snapshot_at);
  const peer=list.items[0].peer.user_id;
  const rows=await p.api.action('dm-messages',{peer_id:peer});
  const first=rows.items[0];
  const status=await p.api.action('dm-status',{peer_id:peer,message_ids:[first.id,'missing']});
  assert.equal(status.peer_id,peer);
  assert.deepEqual(status.statuses,[{id:first.id,read_at:null}]);
  assert.deepEqual(status.ignored_ids,['missing']);
  await assert.rejects(p.api.action('dm-status',{peer_id:'missing',message_ids:[first.id]}),/不存在/);
});
test('DM preview v3 snapshot ids stay fixed, expire, and never cross preview sessions', async()=>{
  const p=createPreview({}), other=createPreview({});
  const first=await p.api.action('dm-conversations');
  assert.match(first.snapshot_id,/^[0-9a-f-]{36}$/);
  assert.equal(first.total_at_snapshot,1);
  assert.equal(first.skipped_slots,0);
  const next=await p.api.action('dm-conversations',{page:1,snapshot_id:first.snapshot_id});
  assert.equal(next.snapshot_id,first.snapshot_id);
  assert.equal(next.snapshot_at,first.snapshot_at);
  assert.deepEqual(next.items,[]);
  assert.equal(next.has_more,false);
  assert.notEqual((await p.api.action('dm-conversations')).snapshot_id,first.snapshot_id);
  await assert.rejects(other.api.action('dm-conversations',{snapshot_id:first.snapshot_id}),e=>e.status===409&&e.code==='snapshot_expired');
  await assert.rejects(p.api.action('dm-conversations',{snapshot_id:'missing'}),e=>e.status===409&&e.code==='snapshot_expired');
  const now=Date.now;
  try {
    Date.now=()=>now()+301000;
    await assert.rejects(p.api.action('dm-conversations',{snapshot_id:first.snapshot_id}),e=>e.status===409&&e.code==='snapshot_expired');
  } finally { Date.now=now; }
});
test('voucher preview exposes a labeled read-only claim and never fabricates a redemption',async()=>{
  const p=createPreview({});
  const shop_id=p.session.get().shop.id;
  const caps=await p.api.action('voucher-capabilities',{shop_id});
  assert.equal(caps.shop_id,shop_id);
  assert.equal(caps.can_lookup,true);
  assert.equal(caps.can_redeem,false);
  const data=await p.api.action('voucher-lookup',{shop_id,code:'demo1234'});
  assert.equal(data.claim.code,'DEMO1234');
  assert.equal(data.can_redeem,false);
  assert.equal(data.reason,'development_preview');
  assert.match(data.claim.voucher.name,/示例/);
  assert.equal(data.claim.recipient_name,undefined);
  assert.equal(data.claim.recipient_phone,undefined);
  await assert.rejects(p.api.action('voucher-lookup',{shop_id,code:'NOTEXIST'}),e=>e.status===404);
  await assert.rejects(p.api.action('voucher-capabilities',{shop_id:'other'}),e=>e.status===403);
  await assert.rejects(p.api.action('voucher-redeem',{shop_id,code:'DEMO1234'}));
  await assert.rejects(p.api.action('voucher-redeem-status',{shop_id,code:'DEMO1234'}));
});
test('schedule preview preserves explicit rest semantics without claiming shop permission or attendance',async()=>{
 const p=createPreview({}),shop=p.session.get().shop;
 const data=await p.api.action('schedule',{month:'2028-02',shop_id:shop.id,view:'mine'});
 assert.equal(data.month,'2028-02');assert.equal(data.shop_id,shop.id);assert.equal(data.view,'mine');
 assert.equal(data.can_view_shop,false);assert.equal(data.persisted,false);
 assert.ok(data.rows.length>1);assert.ok(data.rows.every(r=>r.work_date.startsWith('2028-02-')&&r.is_self===true&&r.shop_name===shop.name));
 const rest=data.rows.find(r=>r.is_rest===true);assert.ok(rest);assert.equal(rest.start_time,null);assert.equal(rest.end_time,null);assert.equal(rest.source,'day_off');
 assert.deepEqual(data.conflicts,[]);
 await assert.rejects(p.api.action('schedule',{month:'2028-02',shop_id:'foreign'}),e=>e.status===403);
 await assert.rejects(p.api.action('schedule',{month:'2028-02',view:'shop'}),e=>e.status===403);
 await assert.rejects(p.api.action('schedule',{month:'2028-13'}),e=>e.status===400);
 await assert.rejects(p.api.action('schedule',{month:'2028-02',view:'invalid'}),e=>e.status===400);
});
test('activity preview uses native UUID routes and masked read-only applications without fake confirmations',async()=>{
 const p=createPreview({}),shop_id=p.session.get().shop.id;
 const activities=await p.api.action('activities',{shop_id});const id=activities.items[0].id;
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const basic=await p.api.action('activity-detail',{shop_id,id});assert.equal(basic.item.id,id);assert.equal(basic.item.shop_id,shop_id);
 const caps=await p.api.action('activity-capabilities',{shop_id});assert.equal(caps.can_manage,true);assert.equal(caps.can_upload_evidence,false);
 const list=await p.api.action('activity-applications',{shop_id,activity_id:id});
 assert.equal(list.shop_id,shop_id);assert.equal(list.activity_id,id);assert.equal(list.order,'desc');assert.equal(list.has_more,false);assert.equal(list.next_cursor,null);
 assert.equal(list.items[0].applicant_name,undefined);assert.equal(list.items[0].applicant_phone,undefined);
 const app_id=list.items[0].id;const detail=await p.api.action('application-detail',{shop_id,application_id:app_id});
 assert.equal(detail.application.id,app_id);assert.equal(detail.application.activity_id,id);assert.match(detail.version,/^[0-9a-f]{64}$/);
 assert.equal(detail.application.applicant_name,undefined);assert.equal(detail.application.form_data,undefined);
 assert.equal(detail.application.publish.screenshots[0].signed_url,null);assert.ok(detail.application.publish.screenshots[0].path);
 assert.equal((await p.api.action('activity-applications',{shop_id,activity_id:id,publish_confirmed:true})).items.length,0);
 await assert.rejects(p.api.action('application-detail',{shop_id,application_id:'missing'}),e=>e.status===404);
 await assert.rejects(p.api.action('activity-capabilities',{shop_id:'foreign'}),e=>e.status===403);
 await assert.rejects(p.api.action('activity-applications',{shop_id,activity_id:id,publish_confirmed:'false'}),e=>e.status===400);
 await assert.rejects(p.api.action('publication-confirm',{shop_id,application_id:app_id}));
 await assert.rejects(p.api.action('publication-confirm-status',{shop_id,application_id:app_id}));
});

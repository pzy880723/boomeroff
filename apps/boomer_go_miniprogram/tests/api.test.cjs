const {test}=require('node:test');const assert=require('node:assert/strict');const{createApi}=require('../miniprogram/shared/api');
test('ERP uses verified GO-to-ERP mapping, never GO shop id as ERP location',async()=>{const urls=[];const wx={request(r){urls.push(r.url);r.success({statusCode:200,data:{ok:true,data:r.url.includes('/session')?{scope:'store',today_location:{id:'erp-s'},visible_locations:[{id:'erp-s'}],shops:[{go_shop_id:'go-s',erp_location_id:'erp-s'}]}:{date:new URL(r.url).searchParams.get('date'),scope:{location_ids:['erp-s']},stores:[{location_id:'erp-s',status:'ok',completeness:{kind:'gross',source_fresh:true,youzan_synced_through:'2026-10-16T00:00:00Z'}}],totals:{actual_fen:12345},completeness:{complete:false,kind:'gross'}}}});}};const session={get:()=>({userId:'u',shop:{id:'go-s'}}),token:()=> 'token'};const api=createApi({wx,config:{erpUrl:'https://erp.test'},session,invoke:()=>{}});const result=await api.sales({period:'today'});assert.equal(urls.length,2);assert.match(urls[1],/location_id=erp-s/);assert.equal(result.revenue,123.45);assert.equal(result.source_label,'付款毛额（未扣退款）');assert.equal(result.complete,false);});
test('album failure rejects instead of claiming a successful save',async()=>{const wx={downloadFile:r=>r.success({statusCode:200,tempFilePath:'temp'}),saveVideoToPhotosAlbum:r=>r.fail()};const api=createApi({wx,config:{},session:{get:()=>({userId:'u'})},invoke(){}});await assert.rejects(api.saveMedia('https://media.test/a.mp4','video'),/相册/);});
test('recognition save preserves actual image type and reuses idempotency key',async()=>{
  const sent=[]; const wx={compressImage:r=>r.fail(),getFileSystemManager:()=>({readFile:r=>r.success({data:'iVBORw0KGgoAAAANSUhEUg=='})})};
  const api=createApi({wx,config:{},session:{get:()=>({userId:'u',shop:{id:'s'}})},invoke:async(name,body)=>{sent.push(body);return {data:{item:{id:'saved'}}};}});
  const input={result:{name:'杯子',description:'商品故事'},photos:['wxfile://photo']};
  await api.action('recognition-save',input); await api.action('recognition-save',input);
  assert.match(sent[0].params.image_data_urls[0],/^data:image\/png;base64,/);
  assert.equal(sent[0].params.request_id,sent[1].params.request_id);
  assert.equal(sent[0].params.photos,undefined);
});
test('oversized photos are rejected before the server receives a rejected upload',async()=>{
  let calls=0; const wx={compressImage:r=>r.success({tempFilePath:'compressed'}),getFileSystemManager:()=>({readFile:r=>r.success({data:'/9j/'+ 'A'.repeat(2800000)})})};
  const api=createApi({wx,config:{},session:{get:()=>({userId:'u'})},invoke:async()=>{calls++;}});
  await assert.rejects(api.recognize(['photo'],''),/过大/); assert.equal(calls,0);
});
test('all direct business invocations renew scope before reaching the backend',async()=>{
  const order=[];const session={get:()=>({userId:'u'}),ensureFresh:async()=>{order.push('renew');}};
  const api=createApi({wx:{},config:{},session,invoke:async()=>{order.push('request');return {data:{items:[]}};}});
  await api.action('knowledge');await api.invoke('surprise-script-job',{action:'current'});
  assert.deepEqual(order,['renew','request','renew','request']);
});
test('ERP authentication failure is distinguishable and cannot retain private operational pages',async()=>{
 const api=createApi({wx:{request:r=>r.success({statusCode:401,data:{ok:false}})},config:{erpUrl:'https://erp.test'},session:{get:()=>({userId:'u',shop:{id:'s'}}),token:()=> 'token'},invoke(){}});
 await assert.rejects(api.sales(),error=>error.status===401);
});
test('profile edits never inject shop fields and local avatars are converted before transport',async()=>{
 const sent=[];const wx={compressImage:r=>r.success({tempFilePath:'compressed'}),getFileSystemManager:()=>({readFile:r=>r.success({data:'/9j/AAAA'})})};
 const api=createApi({wx,config:{},session:{get:()=>({userId:'u',shop:{id:'s'}})},invoke:async(name,body)=>{sent.push(body);return {data:{profile:{display_name:'昵称'}}};}});
 await api.action('profile-update',{display_name:'昵称',avatar_path:'wxfile://local'});
 assert.deepEqual(sent[0].params,{display_name:'昵称',avatar_data_url:'data:image/jpeg;base64,/9j/AAAA'});
});
test('logged-out pages cannot copy retained private text',async()=>{let copied=false;const api=createApi({wx:{setClipboardData:r=>{copied=true;r.success();}},config:{},session:{get:()=>null},invoke(){}});await assert.rejects(api.copy('private'));assert.equal(copied,false);});
test('a pre-handler stale ERP lease is renewed and retried once, never a general write retry',async()=>{
 let requests=0,renewals=0;const session={get:()=>({userId:'u'}),revision:()=>0,ensureFresh:async()=>{},restore:async()=>{renewals++;}};
 const api=createApi({wx:{},config:{},session,invoke:async()=>{if(++requests===1){const error=new Error('stale lease');error.status=403;error.code='erp_scope_not_ready';throw error;}return {data:{items:[]}};}});
 await api.action('profile');assert.equal(requests,2);assert.equal(renewals,1);
});
test('voucher operations and activity reads refuse an unverified missing working shop',async()=>{
 const calls=[];
 const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop:null})},invoke:async(name,body)=>{calls.push(body);return {data:{}};}});
 for(const name of ['voucher-capabilities','voucher-lookup','voucher-redeem','voucher-redeem-status','activities','activity-detail','vouchers','voucher-detail']){
  await assert.rejects(api.action(name,{shop_id:'other-shop',code:'ABCD2345'}),/授权工作门店/);
 }
 assert.equal(calls.length,0);
});
test('voucher operations always use the current verified shop and preserve the same write intent',async()=>{
 const calls=[];
 const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop:{id:'own-shop'}})},invoke:async(name,body)=>{calls.push(body);return {data:{state:'not_found'}};}});
 const params={shop_id:'other-shop',code:'ABCD2345',request_id:'44444444-4444-4444-8444-000000000001'};
 await api.action('voucher-redeem',params);
 await api.action('voucher-redeem-status',params);
 assert.ok(calls.every(body=>body.params.shop_id==='own-shop'));
 assert.ok(calls.every(body=>body.params.request_id===params.request_id&&body.params.code===params.code));
 assert.equal(params.shop_id,'other-shop','caller input must not be mutated');
});
test('schedule views require and send only the verified selected working shop',async()=>{
 let selected=null;const calls=[];
 const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop:selected})},invoke:async(name,body)=>{calls.push(body);return {data:{rows:[]}};}});
 await assert.rejects(api.action('schedule',{month:'2026-10',view:'shop',shop_id:'foreign'}),/授权工作门店/);
 assert.equal(calls.length,0);
 selected={id:'own'};
 await api.action('schedule',{month:'2026-10',view:'mine',shop_id:'foreign'});
 assert.deepEqual(calls[0].params,{month:'2026-10',view:'mine',shop_id:'own'});
});
test('activity management never accepts a caller-selected foreign shop or a missing verified shop',async()=>{
 let selected=null;const calls=[];
 const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop:selected})},invoke:async(name,body)=>{calls.push(body);return {data:{shop_id:'own'}};}});
 const actions=['activity-capabilities','activity-applications','application-detail','publication-confirm','publication-confirm-status'];
 for(const action of actions) await assert.rejects(api.action(action,{shop_id:'foreign'}),/授权工作门店/);
 assert.equal(calls.length,0);selected={id:'own'};
 for(const action of actions) await api.action(action,{shop_id:'foreign',application_id:'app',request_id:'intent'});
 assert.ok(calls.every(r=>r.params.shop_id==='own'&&r.params.application_id==='app'&&r.params.request_id==='intent'));
});
test('store KB reads and writes require the verified selected store and preserve frozen operation fields',async()=>{
 let shop=null;const calls=[];const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop})},invoke:async(name,body)=>{calls.push(body);return {data:{}};}});
 const names=['kb-capabilities','kb-list','kb-detail','kb-write','kb-write-status'];
 for(const name of names)await assert.rejects(api.action(name,{shop_id:'foreign',type:'sop'}),/授权工作门店/);
 assert.equal(calls.length,0);shop={id:'current'};
 const params={shop_id:'foreign',type:'qa',request_id:'request',operation:'update',entry_id:'entry',expected_version:'version',title:'draft',body:'body',tags:['tag']};
 for(const name of names)await api.action(name,params);
 assert.ok(calls.every(x=>x.params.shop_id==='current'&&x.params.request_id==='request'&&x.params.expected_version==='version'&&x.params.body==='body'));
 assert.equal(params.shop_id,'foreign');
});
test('legacy SOP QA training detail requires store context without blocking ordinary knowledge',async()=>{
 let shop=null;const calls=[];const api=createApi({wx:{},config:{},session:{get:()=>({userId:'u',shop})},invoke:async(name,body)=>{calls.push(body);return {data:{id:'x',title:'content'}};}});
 for(const kind of ['sop','qa','training'])await assert.rejects(api.action('knowledge-detail',{kind,id:'x',shop_id:'foreign'}),/授权工作门店/);
 await assert.rejects(api.action('knowledge-detail',{source:'sop',id:'x'}),/授权工作门店/);
 assert.equal(calls.length,0);await api.action('knowledge-detail',{kind:'official',id:'x'});assert.equal(calls.length,1);
 shop={id:'current'};await api.action('knowledge-detail',{kind:'sop',id:'x',shop_id:'foreign'});assert.equal(calls[1].params.shop_id,'current');
});
test('AI knowledge drafting binds the verified store without automatic post-provider scope retry',async()=>{
 let shop=null,restores=0;const calls=[];
 const session={get:()=>({userId:'u',shop}),restore:async()=>{restores++;}};
 const api=createApi({wx:{},config:{},session,invoke:async(name,body)=>{calls.push(body);if(body.params.hint==='scope-loss')throw Object.assign(new Error('changed'),{status:403,code:'draft_scope_changed'});return {data:{persisted:false}};}});
 await assert.rejects(api.action('kb-draft',{shop_id:'foreign',type:'sop',topic:'开店'}),/授权工作门店/);
 assert.equal(calls.length,0);shop={id:'current'};
 const input={shop_id:'foreign',type:'qa',topic:'商品品相',hint:'如实介绍'};
 await api.action('kb-draft',input);assert.deepEqual(calls[0].params,{...input,shop_id:'current'});assert.equal(input.shop_id,'foreign');
 await assert.rejects(api.action('kb-draft',{type:'qa',topic:'品相',hint:'scope-loss'}),e=>e.status===403&&e.code==='draft_scope_changed');
 assert.equal(calls.length,2);assert.equal(restores,3,'one pre-generation renewal per attempt, never another renewal after provider scope loss');
});
test('paid draft preparation renews once even inside the ordinary freshness window and blocks stale scope before provider',async()=>{
 let restores=0,ensureFresh=0,revision=1;const calls=[];
 const session={get:()=>({userId:'u',shop:{id:'current'},scopeVersion:1}),revision:()=>revision,ensureFresh:async()=>{ensureFresh++;},restore:async()=>{restores++;}};
 const api=createApi({wx:{},config:{},session,invoke:async(name,body)=>{calls.push(body);return {data:{persisted:false}};}});
 await api.action('profile');assert.equal(ensureFresh,1);assert.equal(restores,0);
 await api.action('kb-draft',{type:'sop',topic:'开店'});assert.equal(ensureFresh,1);assert.equal(restores,1);assert.equal(calls.length,2);
 session.restore=async()=>{restores++;revision++;};
 await assert.rejects(api.action('kb-draft',{type:'sop',topic:'开店'}),e=>e.code==='stale_operation');assert.equal(calls.length,2);
 session.restore=async()=>{restores++;throw new Error('renewal unavailable');};
 await assert.rejects(api.action('kb-draft',{type:'sop',topic:'开店'}),/renewal unavailable/);assert.equal(calls.length,2);
});

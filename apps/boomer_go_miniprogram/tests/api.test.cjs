const {test}=require('node:test');const assert=require('node:assert/strict');const{createApi}=require('../miniprogram/shared/api');
test('ERP uses verified GO-to-ERP mapping, never GO shop id as ERP location',async()=>{const urls=[];const wx={request(r){urls.push(r.url);r.success({statusCode:200,data:{ok:true,data:r.url.includes('/session')?{scope:'store',today_location:{id:'erp-s'},visible_locations:[{id:'erp-s'}],shops:[{go_shop_id:'go-s',erp_location_id:'erp-s'}]}:{date:'2026-10-16',scope:{location_ids:['erp-s']},stores:[{location_id:'erp-s',status:'ok',completeness:{kind:'gross',source_fresh:true,youzan_synced_through:'2026-10-16T00:00:00Z'}}],totals:{actual_fen:12345},completeness:{complete:false,kind:'gross'}}}});}};const session={get:()=>({userId:'u',shop:{id:'go-s'}}),token:()=> 'token'};const api=createApi({wx,config:{erpUrl:'https://erp.test'},session,invoke:()=>{}});const result=await api.sales({period:'today'});assert.equal(urls.length,2);assert.match(urls[1],/location_id=erp-s/);assert.equal(result.revenue,123.45);assert.equal(result.source_label,'付款毛额（未扣退款）');assert.equal(result.complete,false);});
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

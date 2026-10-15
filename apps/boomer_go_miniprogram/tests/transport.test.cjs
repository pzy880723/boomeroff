const {test}=require('node:test');const assert=require('node:assert/strict');
const {createTransport}=require('../miniprogram/shared/transport');
const config={supabaseUrl:'https://example.test',publicKey:'public',scopeRegion:'ap-northeast-2'};
test('scope uses fixed project origin and supported region with current token',async()=>{let req;const transport=createTransport({request(r){req=r;r.success({statusCode:200,data:{ok:true}});}},config,()=> 'current-token');await transport('erp-scope-sync',{});assert.equal(req.header.Authorization,'Bearer current-token');assert.match(req.url,/^https:\/\/example.test\/functions\/v1\/erp-scope-sync\?forceFunctionRegion=ap-northeast-2$/);});
test('provider error never resolves as sent',async()=>{const call=createTransport({request:r=>r.success({statusCode:500,data:{ok:false,code:'sms_send_failed'}})},config,()=>null);await assert.rejects(call('phone-login-send-otp',{}),/短信发送失败/);});
test('status 401 is distinguishable from empty lists',async()=>{const call=createTransport({request:r=>r.success({statusCode:401,data:{}})},config,()=>null);await assert.rejects(call('go-mini-api',{}),e=>e.status===401);});
test('endpoint path cannot escape fixed function origin',async()=>{let called=false;const call=createTransport({request:r=>{called=true;r.success({statusCode:200,data:{}});}},config,()=>null);await assert.rejects(call('https://evil.test',{}));assert.equal(called,false);});
test('AI replies receive a longer timeout without slowing OTP errors or auto retrying',async()=>{const calls=[];const call=createTransport({request:r=>{calls.push(r);r.success({statusCode:200,data:{ok:true}});}},config,()=>null);await call('spirit-chat',{});await call('go-mini-api',{action:'conversation-send'});await call('phone-login-send-otp',{});assert.equal(calls.length,3);assert.equal(calls[0].timeout,65000);assert.equal(calls[1].timeout,65000);assert.equal(calls[2].timeout,20000);});
test('refresh uses only the public client header rather than an expired user bearer',async()=>{let header;const call=createTransport({request:r=>{header=r.header;r.success({statusCode:200,data:{}});}},config,()=> 'expired');await call('auth:refresh',{refresh_token:'test'});assert.equal(header.Authorization,'Bearer public');});
test('server quiz generation and media persistence are not cut off by the basic 20-second timeout',async()=>{const calls=[];const call=createTransport({request:r=>{calls.push(r);r.success({statusCode:200,data:{}});}},config,()=>null);for(const action of ['quiz-start','recognition-save','profile-update'])await call('go-mini-api',{action});assert.ok(calls.every(r=>r.timeout===65000));});
test('knowledge AI drafting has a bounded long timeout while ordinary reads and OTP stay short',async()=>{
 const calls=[];const call=createTransport({request:r=>{calls.push(r);r.success({statusCode:200,data:{ok:true}});}},config,()=> 'current');
 await call('go-mini-api',{action:'kb-draft'});await call('go-mini-api',{action:'kb-detail'});await call('phone-login-send-otp',{});
 assert.deepEqual(calls.map(r=>r.timeout),[65000,20000,20000]);assert.equal(calls[0].header.Authorization,'Bearer current');
});
test('knowledge AI failures remain explicit, preserve codes and never retry or imply a saved draft',async()=>{
 for(const [status,code,pattern] of [[402,'ai_budget_exhausted',/额度/],[429,'ai_rate_limited',/频繁/],[502,'ai_unavailable',/起草服务/],[502,'ai_invalid_response',/完整草稿/],[502,'reference_unavailable',/知识参考/],[504,'ai_timeout',/超时/],[403,'draft_scope_changed',/权限.*变化/]]){
  let count=0;const call=createTransport({request:r=>{count++;r.success({statusCode:status,data:{ok:false,code,provider_body:'not to display'}});}},config,()=> 'current');
  await assert.rejects(call('go-mini-api',{action:'kb-draft'}),e=>e.status===status&&e.code===code&&pattern.test(e.message)&&!e.message.includes('not to display'));
  assert.equal(count,1);
 }
});

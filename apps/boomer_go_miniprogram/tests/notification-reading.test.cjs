const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=path.resolve(__dirname,'../miniprogram');
const row=(id,extra={})=>({id,title:'通知 '+id,body:'完整正文 '+id,category:'notice',type:'announcement',created_at:'2026-10-17T01:00:00Z',...extra});
const data=(page,items,has_more=false)=>({page,page_size:20,items,has_more});
const reader=()=>require('../miniprogram/shared/notification-read').read;
function harness(name,action){
 let spec,revision=1,user={userId:'00000000-0000-4000-8000-000000000902',shop:{id:'00000000-0000-4000-8000-000000000901'},permissions:[]};
 const calls=[],nav=[],session={get:()=>user,revision:()=>revision,signOut(){user=null;revision++;}};
 const wx={navigateTo:r=>nav.push(r.url),reLaunch:r=>nav.push(r.url),stopPullDownRefresh(){}};
 const app={session,preview:false,ensureSession:async()=>true,api:{action:async(n,p)=>{calls.push({name:n,params:p});return action(n,p);}}},shell={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'shared/page.js'),'utf8'),{module:shell,getApp:()=>app,wx});
 const file=path.join(root,'pages',name,'index.js');vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:v=>{spec=v;},getApp:()=>app,wx,setTimeout:()=>1,clearTimeout(){},require:id=>id==='../../shared/page'?shell.exports:require(path.resolve(path.dirname(file),id))});
 const page={...spec,data:structuredClone(spec.data),setData(p){Object.assign(this.data,p);}};
 return {page,calls,nav,app,revise(){revision++;},setUser(v){user=v;revision++;}};
}

test('notification exact read finds later pages and carries full body, summary and original banner',async()=>{
 const calls=[],target=row('later',{body:'<p>完整正文，不可用摘要代替</p>',summary:'简短摘要',image_url:'https://example.invalid/banner.jpg'});
 const out=await reader()({action:async(n,p)=>{calls.push({n,p});return p.page?data(1,[target]):data(0,[row('first')],true);}},'later',()=>true);
 assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.p),[{page:0,page_size:20},{page:1,page_size:20}]);
 assert.equal(out.item.id,'later');assert.equal(out.item.body,target.body);assert.equal(out.item.summary,'简短摘要');assert.equal(out.item.cover_url,target.image_url);
});

test('notification read never substitutes unrelated content or treats a malformed page as empty',async()=>{
 await assert.rejects(reader()({action:async()=>data(0,[row('other')])},'missing',()=>true),/不可见|不存在|移除/);
 for(const bad of [{items:[]},data(1,[]),{...data(0,[]),page_size:50},{...data(0,[]),has_more:'false'},data(0,[row('x'),row('x')]),data(0,[],true)])
  await assert.rejects(reader()({action:async()=>bad},'missing',()=>true),/分页|列表|内容|返回/);
});

test('notification read stops repeated pages and never requests another page after lifecycle loss',async()=>{
 let calls=0;await assert.rejects(reader()({action:async(_n,p)=>{calls++;return data(p.page,[row('same')],true);}},'missing',()=>true),/变化|重复/);assert.equal(calls,2);
 let active=true;calls=0;await assert.rejects(reader()({action:async()=>{calls++;active=false;return data(0,[row('x')],true);}},'missing',()=>active),e=>e.code==='stale_operation');assert.equal(calls,1);
});

test('notification read rejects empty IDs, wrong content types and non-HTTPS banner URLs',async()=>{
 await assert.rejects(reader()({action:async()=>data(0,[])},'',()=>true));
 await assert.rejects(reader()({action:async()=>data(0,[row('x',{body:{private:true}})])},'x',()=>true));
 const out=await reader()({action:async()=>data(0,[row('x',{image_url:'javascript:alert(1)'})])},'x',()=>true);assert.equal(out.item.cover_url,'');
});

test('actual native notification detail paginates exact ID and displays separate summary/banner',async()=>{
 const h=harness('detail',(_n,p)=>p.page?data(1,[row('later',{summary:'摘要不替代正文',image_url:'https://example.invalid/banner.jpg'})]):data(0,[row('first')],true));
 await h.page.onLoad({kind:'notifications',id:'later'});assert.equal(h.page.data.item.id,'later');assert.equal(h.page.data.item.summary,'摘要不替代正文');assert.equal(h.page.data.item.cover_url,'https://example.invalid/banner.jpg');
 assert.ok(JSON.stringify(h.page.data.nodes).includes('完整正文 later'));assert.equal(h.calls.length,2);
 assert.match(fs.readFileSync(path.join(root,'pages/detail/index.wxml'),'utf8'),/item.summary/);
});

test('notification detail hide clears private content and stops old reads; foreground reads again',async()=>{
 const h=harness('detail',async()=>data(0,[row('x')]));await h.page.onLoad({kind:'notifications',id:'x'});h.page.onHide();assert.equal(h.page.data.item,null);assert.equal(h.page.data.nodes.length,0);
 await h.page.onShow();assert.equal(h.page.data.item.id,'x');assert.equal(h.calls.length,2);
 let resolve;h.app.api.action=()=>new Promise(done=>{resolve=done;});const pending=h.page.load();h.page.onHide();resolve(data(0,[row('x')]));await pending;assert.equal(h.page.data.item,null);
});

test('loaded notification controls filter news/type/search while leaving global loaded unread count truthful',async()=>{
 const items=[row('a',{title:'开店说明',category:'notice',type:'policy',read:false}),row('b',{title:'新店开业',category:'news',type:'store_open',read:true,image_url:'https://example.invalid/news.jpg',summary:'动态摘要'}),row('c',{title:'培训安排',category:'notice',type:'announcement',read:false})];
 const h=harness('messages',()=>data(0,items));await h.page.onLoad();await h.page.onShow();
 h.page.onNotificationGroup({currentTarget:{dataset:{group:'news'}}});assert.deepEqual(Array.from(h.page.data.visibleItems,x=>x.id),['b']);assert.equal(h.page.data.unread,2);
 assert.equal(h.page.data.visibleItems[0].cover_url,'https://example.invalid/news.jpg');
 h.page.onNotificationGroup({currentTarget:{dataset:{group:'all'}}});h.page.onNotificationSearch({detail:{value:'开店'}});assert.deepEqual(Array.from(h.page.data.visibleItems,x=>x.id),['a']);
 h.page.onNotificationSearch({detail:{value:''}});const i=h.page.data.notificationTypes.findIndex(x=>x.value==='policy');h.page.onNotificationType({detail:{value:String(i)}});assert.deepEqual(Array.from(h.page.data.visibleItems,x=>x.id),['a']);
});

test('native notification management entry uses fresh explicit permissions, never HQ or role aliases',async()=>{
 for(const mode of ['staff','hq','legacy','stale','allowed']){
  const h=harness('messages',()=>data(0,[]));
  h.setUser({userId:'employee',shop:null,scopeFresh:mode!=='stale',isHeadquarters:mode==='hq',role:mode==='legacy'?'admin':'staff',permissions:mode==='allowed'||mode==='stale'?['role.manage']:[]});
  await h.page.onLoad();h.page.openNotificationManage();assert.equal(h.nav.length,mode==='allowed'?1:0,mode);
  if(mode==='allowed'){assert.equal(h.nav[0],'/pages/notification-manage/index');h.page.onHide();h.page.openNotificationManage();assert.equal(h.nav.length,1);}
 }
 assert.ok(require('../miniprogram/app.json').pages.includes('pages/notification-manage/index'));
 assert.equal(require('../miniprogram/app.json').tabBar.list.length,5);
});

test('notification synthetic manager is scoped globally and never mutates or invents a receipt',async()=>{
 const p=require('../miniprogram/shared/preview').createPreview({});
 assert.equal((await p.api.notificationManageCapabilities()).can_manage,true);
 const all=await p.api.notificationManageList();assert.equal(all.items.length,2);assert.ok(all.items.every(r=>r.title.includes('示例')&&!Object.hasOwn(r,'shop_id')));
 const before=await p.api.notificationManageRead(all.items[0].id);before.title='changed';assert.notEqual((await p.api.notificationManageRead(all.items[0].id)).title,'changed');
 await assert.rejects(p.api.notificationManageWrite({operation:'delete',id:before.id}));
 assert.equal((await p.api.notificationManageList()).items.length,2);
});

test('notification category projection never sends inherited prototype values into native data',async()=>{
 for(const category of ['constructor','toString','__proto__']){
  const h=harness('messages',()=>data(0,[row('x',{category})]));await h.page.onLoad();assert.equal(h.page.data.items[0].category,'工作通知');
 }
});

test('native manager distinguishes expired enabled rows from current enabled rows',async()=>{
 const h=harness('notification-manage',()=>data(0,[])),p=require('../miniprogram/shared/preview').createPreview({});
 const rows=(await p.api.notificationManageList()).items;rows[0].expires_at='2000-01-01T15:59:59.000Z';rows[1].active=true;rows[1].expires_at='2099-01-01T15:59:59.000Z';
 Object.assign(h.app.api,{notificationManageCapabilities:async()=>({can_manage:true}),notificationManageList:async()=>({items:rows})});
 await h.page.onLoad();assert.equal(h.page.data.items[0].expired,true);assert.equal(h.page.data.items[1].expired,false);
 assert.match(fs.readFileSync(path.join(root,'pages/notification-manage/index.wxml'),'utf8'),/item.expired/);
});

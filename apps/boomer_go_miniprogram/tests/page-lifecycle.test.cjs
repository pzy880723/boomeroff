const {test}=require('node:test');const assert=require('node:assert/strict');const{definePage}=require('../miniprogram/shared/page');
test('authentication expiry clears private navigation instead of leaving old tabs behind',async()=>{let signedOut=false,route='';global.wx={reLaunch:r=>route=r.url};const spec=definePage({});const page=Object.assign({},spec,{data:{},session:{signOut(){signedOut=true;}},setData(data){Object.assign(this.data,data);}});await page.run(async()=>{const e=new Error('登录过期');e.status=401;throw e;});assert.equal(signedOut,true);assert.equal(route,'/pages/login/index');delete global.wx;});
test('a stale operation releases its own spinner but cannot clear a newer load',async()=>{
 let revision=0,release;const page=Object.assign({},definePage({}),{data:{},session:{revision:()=>revision},setData(data){Object.assign(this.data,data);}});
 const first=page.run(()=>new Promise(resolve=>{release=resolve;}));revision++;release();await first;assert.equal(page.data.loading,false);
 let older,newer;const old=page.run(()=>new Promise(resolve=>{older=resolve;}));const fresh=page.run(()=>new Promise(resolve=>{newer=resolve;}));older();await old;assert.equal(page.data.loading,true);newer();await fresh;assert.equal(page.data.loading,false);
});

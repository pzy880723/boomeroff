const {test}=require('node:test');const assert=require('node:assert/strict');
test('explicit developer preview survives reload but is impossible in a release build',()=>{for(const env of ['develop','release']){let app;global.App=a=>app=a;global.wx={getStorageSync:k=>k==='go-mini.preview-opt-in',setStorageSync(){},getAccountInfoSync:()=>({miniProgram:{envVersion:env}})};const file=require.resolve('../miniprogram/app');delete require.cache[file];require(file);app.onLaunch({query:{}});assert.equal(app.preview,env==='develop');if(env==='release')assert.equal(app.enablePreview(),false);}delete global.wx;delete global.App;});
test('app owns separate real and synthetic practice coordinators and clears RAM at auth transitions',()=>{
 let app;const data=new Map();global.App=a=>app=a;global.wx={getStorageSync:k=>data.get(k),setStorageSync:(k,v)=>data.set(k,v),removeStorageSync:k=>data.delete(k),getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}})};
 try{
  const file=require.resolve('../miniprogram/app');delete require.cache[file];require(file);app.onLaunch({query:{}});
  assert.ok(app.dailyPractice);assert.equal(app.dailyPractice.view().preview,false);
  let clears=0;app.dailyPractice.clear=()=>clears++;app.session.signOut();assert.equal(clears,1);
  const real=app.dailyPractice;app.enablePreview();assert.notEqual(app.dailyPractice,real);assert.equal(app.dailyPractice.view().preview,true);
  app.leavePreview();assert.equal(app.dailyPractice.view().preview,false);assert.equal(app.dailyPractice.view().active,false);
 }finally{delete global.wx;delete global.App;}
});

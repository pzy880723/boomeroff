const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../miniprogram');
test('five approved tabs use native pages',()=>{
  assert.ok(fs.existsSync(path.join(root,'app.json')),'native app config must exist');
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
  assert.deepEqual(app.tabBar.list.map(x=>x.text),['工作台','学习','识物','消息','我的']);
  for(const tab of app.tabBar.list){assert.ok(app.pages.includes(tab.pagePath));}
});
test('continuous learning is a native secondary route, never a sixth tab',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 assert.ok(app.pages.includes('pages/practice/index'));assert.equal(app.tabBar.list.length,5);
});
test('store SOP and QA maintenance use dedicated native secondary routes',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
 assert.ok(app.pages.includes('pages/store-kb/index'));
 assert.ok(app.pages.includes('pages/store-kb-edit/index'));
 assert.equal(app.tabBar.list.length,5);
});
test('native source never embeds or navigates to a web page',()=>{
  function walk(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]):[];}
  const files=walk(root).filter(x=>/\.(js|wxml|json)$/.test(x));
  assert.ok(files.length>0,'native source must exist');
  for(const file of files){const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/<web-view\b|navigateToMiniProgram|https?:\/\/[^\s"']*\.html/,'no H5 replacement: '+file);}
});
test('staff chat has its own native route and does not replace a tab',()=>{
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
  assert.ok(app.pages.includes('pages/chat/index'));
  assert.equal(app.tabBar.list.length,5);
});
test('community entries open the native interactive post detail',()=>{
  const model=require('../miniprogram/pages/list/model');
  assert.equal(model.detailUrl('community','post-123'),'/pages/community/index?id=post-123');
});
test('voucher templates stay distinct from the native customer-code redemption flow',()=>{
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
  assert.ok(app.pages.includes('pages/voucher/index'));
  assert.equal(app.tabBar.list.length,5);
  const list=fs.readFileSync(path.join(root,'pages/list/index.wxml'),'utf8');
  assert.match(list,/kind === 'vouchers'/);
  assert.match(list,/data-url="\/pages\/voucher\/index"/);
  assert.match(list,/扫码核销/);
  const mine=fs.readFileSync(path.join(root,'pages/mine/index.js'),'utf8');
  assert.match(mine,/门店优惠券/);
  assert.doesNotMatch(mine,/label: '我的券包'/);
});
test('activity management and manual publication confirmation stay native under the same five tabs',()=>{
  const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
  assert.ok(app.pages.includes('pages/activity/index'));
  assert.ok(app.pages.includes('pages/application/index'));
  assert.equal(app.tabBar.list.length,5);
  const model=require('../miniprogram/pages/list/model');
  assert.equal(model.detailUrl('activities','a/b ?中'),'/pages/activity/index?id='+encodeURIComponent('a/b ?中'));
});

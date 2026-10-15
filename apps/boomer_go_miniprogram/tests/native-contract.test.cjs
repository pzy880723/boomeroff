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
test('native source never embeds or navigates to a web page',()=>{
  function walk(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]):[];}
  const files=walk(root).filter(x=>/\.(js|wxml|json)$/.test(x));
  assert.ok(files.length>0,'native source must exist');
  for(const file of files){const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/<web-view\b|navigateToMiniProgram|https?:\/\/[^\s"']*\.html/,'no H5 replacement: '+file);}
});

const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../miniprogram');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?walk(path.join(dir,f.name)):[path.join(dir,f.name)]);
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8'));
for(const page of app.pages)for(const suffix of ['.js','.json','.wxml','.wxss'])if(!fs.existsSync(path.join(root,page+suffix)))throw Error('Missing native page: '+page+suffix);
for(const file of walk(root)){if(file.endsWith('.js'))execFileSync(process.execPath,['--check',file]);if(file.endsWith('.json'))JSON.parse(fs.readFileSync(file,'utf8'));if(/\.(js|json|wxml|wxss)$/.test(file)){const content=fs.readFileSync(file,'utf8');if(/<web-view\b|navigateToMiniProgram/.test(content))throw Error('H5 escape: '+file);if(/service_role|SUPABASE_SERVICE_ROLE|DEEPSEEK_API_KEY/.test(content))throw Error('Server-secret marker in client source: '+file);}}
console.log('Checked '+app.pages.length+' native routes, syntax, JSON and no H5/server-secret markers.');

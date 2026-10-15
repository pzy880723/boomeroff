const fs=require('node:fs');const path=require('node:path');
const envFile=path.resolve(__dirname,'../../..','.env');
const lines=fs.readFileSync(envFile,'utf8').split(/\r?\n/);
const env={};for(const line of lines){const m=line.match(/^(VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,'');}
if(!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_PUBLISHABLE_KEY)throw Error('Missing public project configuration');
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
let publicKey=key.startsWith('sb_publishable_');
if(key.split('.').length===3){try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{publicKey=false;}}
if(!publicKey)throw Error('Only public anon or publishable credentials may enter the mini-program');
const file=path.resolve(__dirname,'../miniprogram/config.js');
const config={supabaseUrl:env.VITE_SUPABASE_URL,publicKey:env.VITE_SUPABASE_PUBLISHABLE_KEY,erpUrl:'https://erp.boomeroff.com',scopeRegion:'ap-northeast-2',preview:false};
fs.writeFileSync(file,'// Generated public project configuration. Never place server secrets here.\nmodule.exports = '+JSON.stringify(config,null,2)+';\n');
console.log('Public project configuration generated; no service-role key is read.');

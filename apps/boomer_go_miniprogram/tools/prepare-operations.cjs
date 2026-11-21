const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const project = path.resolve(__dirname, '..');
const source = path.join(project, 'operations-mini');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function prepare(output) {
  output = path.resolve(output);
  const target = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
  if (target === project || target.startsWith(project + path.sep)) throw new Error('Output must be outside source project');
  if (fs.existsSync(target)) throw new Error('Output already exists');
  const files = new Map();
  function collect(dir, relative) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      const file = path.join(dir, entry.name);
      if (!/^[a-z0-9_.-]+$/i.test(entry.name) || entry.name.startsWith('.')) throw new Error('Unexpected source: ' + name);
      if (entry.isDirectory()) collect(file, name);
      else if (entry.isFile() && /\.(?:js|json|wxml|wxss|png)$/.test(name)) files.set(name, fs.readFileSync(file));
      else throw new Error('Unexpected source: ' + name);
    }
  }
  collect(source, 'miniprogram');
  files.set('miniprogram/shared/erp-auth.js', fs.readFileSync(path.join(project, 'miniprogram/shared/erp-auth.js')));
  for (const [name, bytes] of files) {
    if (name.endsWith('.png')) continue;
    if (/lovable|supabase|web-view|AppSecret|service_role/i.test(bytes.toString())) throw new Error('Unsupported dependency in ' + name);
    if (name.endsWith('.json')) JSON.parse(bytes);
    if (name.endsWith('.js')) new (require('node:vm').Script)(bytes.toString(), { filename: name });
  }
  const appid = JSON.parse(fs.readFileSync(path.join(project, 'project.config.json'))).appid;
  if (appid !== 'wx5c4f68873d7f919c') throw new Error('Wrong employee AppID');
  const json = (name, data) => files.set(name, Buffer.from(JSON.stringify(data, null, 2) + '\n'));
  json('project.config.json', { appid, projectname: 'BOOMER GO Operations', compileType: 'miniprogram',
    projectArchitecture: 'multiPlatform', miniprogramRoot: 'miniprogram/', setting: { urlCheck: true, es6: true } });
  json('app.miniapp.json', { description: 'Employee Donut development; native binding pending.', appid: '',
    miniprogramAppid: '', pages: { login: 'pages/login/index', workbench: 'pages/workbench/index' } });
  json('project.miniapp.json', { miniVersion: 'v2', name: 'BOOMER GO', version: '0.0.1', versionCode: 1,
    'mini-android': { resourcePath: 'miniapp/android/nativeResources', sdkVersion: '1.6.24', toolkitVersion: '0.11.0', privacy: { enable: true } },
    'mini-ios': { sdkVersion: '1.7.0', toolkitVersion: '0.0.9', privacy: { enable: true } } });
  fs.mkdirSync(target, { mode: 0o700 });
  fs.mkdirSync(path.join(target, 'miniapp/android/nativeResources'), { recursive: true });
  for (const [name, bytes] of files) {
    const file = path.join(target, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx' });
  }
  const receipt = { targets: ['wechat', 'android', 'ios'], employeeAppId: appid,
    nativeBindingConfigured: false, files: Object.fromEntries([...files].map(([name, bytes]) => [name, hash(bytes)])) };
  fs.writeFileSync(path.join(target, 'go-source-manifest.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}

module.exports = { prepare };
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Provide an unused external output directory');
  const result = prepare(process.argv[2]);
  console.log('Prepared ' + result.targets.join(', ') + ' from one source; native binding not configured.');
}

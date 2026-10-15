const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.join(__dirname, '../miniprogram/pages');
const plain = value => JSON.parse(JSON.stringify(value));
const event = (value, dataset = {}) => ({ detail: { value }, currentTarget: { dataset } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function page(name, api = {}, wx = {}) {
  const file = path.join(root, name, 'index.js');
  assert.ok(fs.existsSync(file), `${name} native page must exist`);
  let definition;
  const requireFile = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: id => id === '../../shared/page' ? { definePage: value => value } : requireFile(id),
    Page: value => { definition = value; }, wx,
    setTimeout: () => 1, clearTimeout() {}, console,
  }, { filename: file });
  const p = { ...definition, data: { loading: false, error: '', ...plain(definition.data) }, api,
    session: { get: () => ({ userId: 'employee-1', shop: { id: 'shop-1', name: '门店' } }) },
    setData(patch) { Object.assign(this.data, patch); },
    async run(task) {
      this.data.error = '';
      try { return await task(); } catch (error) {
        if (!this._disposed) this.data.error = error.message;
      }
    }, navigate(url) { this.navigated = url; },
  };
  return p;
}
function cameraWx() {
  let shots = 0;
  return { shots: () => shots,
    createCameraContext: () => ({ takePhoto({ success }) { shots++; success({ tempImagePath: `shot-${shots}` }); } }),
    showModal() { assert.fail('shutter must not ask for confirmation'); },
    chooseMedia({ sourceType }) { assert.deepEqual(plain(sourceType), ['album']); },
  };
}
const script = () => ({ hook: { dialogue: '开场', scene: '门头' }, scenes: [{ dialogue: '原稿' }], outro: { dialogue: '结尾' }, continuous_dialogue: '完整口播', total_duration_s: 15 });
const scriptState = (overrides = {}) => ({ ok: true, task_kind: 'script', job_id: 'script-1', status: 'script_ready', script: script(), result: { style: 'lively' }, picked_assets: [], conversation: [], pending_changes: [], ...overrides });
const videoAsset = () => ({ id: 'asset-1', kind: 'video', output_url: 'https://ai.boomeroff.com/original.mp4', meta: { status: 'succeeded', poster_url: 'https://ai.boomeroff.com/cover.jpg', video_copy: { title: '真实标题', body: '真实文案', hashtags: ['中古'] } } });

test('recognition view uses a real continuous camera, never per-shot confirmation', () => {
  const wxml = fs.readFileSync(path.join(root, 'recognize/index.wxml'), 'utf8');
  assert.match(wxml, /<camera\b/);
  assert.match(wxml, /bindtap="takePhoto"/);
  const source = fs.readFileSync(path.join(root, 'recognize/index.js'), 'utf8');
  assert.match(source, /createCameraContext/);
  assert.doesNotMatch(source, /showModal|sourceType:\s*\[\s*['"]camera/);
});
test('shutter immediately appends thumbnails and stops at five', async () => {
  const wx = cameraWx(); const p = page('recognize', {}, wx);
  p.onLoad(); p.onShow(); p.cameraReady();
  for (let i = 0; i < 7; i++) await p.takePhoto();
  assert.equal(p.data.photos.length, 5); assert.equal(wx.shots(), 5);
  assert.equal(p.data.photos[0], 'shot-1');
});
test('camera failure preserves earlier shots and releases shutter lock', async () => {
  const p = page('recognize', {}, { createCameraContext: () => ({ takePhoto: ({ fail }) => fail({ errMsg: '相机不可用' }) }) });
  p.onLoad(); p.onShow(); p.cameraReady(); p.setData({ photos: ['kept'] });
  await p.takePhoto(); assert.deepEqual(plain(p.data.photos), ['kept']);
  assert.match(p.data.error, /相机/); assert.equal(p._capturing, false);
});
test('album import is album-only and capped against existing photos', async () => {
  const p = page('recognize', {}, { chooseMedia(options) {
    assert.equal(options.count, 2); assert.deepEqual(plain(options.sourceType), ['album']);
    options.success({ tempFiles: [{ tempFilePath: 'a' }, { tempFilePath: 'b' }, { tempFilePath: 'overflow' }] });
  } });
  p.onLoad(); p.setData({ photos: ['1', '2', '3'] }); await p.pickAlbum();
  assert.deepEqual(plain(p.data.photos), ['1', '2', '3', 'a', 'b']);
});
test('recognition failure retains photos and hint for retry', async () => {
  const p = page('recognize', { recognize: async (photos, hint) => {
    assert.deepEqual(plain(photos), ['front', 'base']); assert.equal(hint, '底款'); throw new Error('连接中断');
  } });
  p.onLoad(); p.setData({ photos: ['front', 'base'], hint: ' 底款 ' }); await p.recognize();
  assert.deepEqual(plain(p.data.photos), ['front', 'base']); assert.equal(p.data.hint, ' 底款 ');
  assert.match(p.data.error, /连接中断/);
});
test('recognition renders server story and selling points without invented confidence', async () => {
  const result = { name: '杯', material: '陶瓷', origin: '待考', craft: '彩绘', description: '服务端故事', sellingPoints: [{ tag: '工艺', text: '手绘纹样' }], pitch: { story: '服务端背景' } };
  const p = page('recognize', { recognize: async () => result }); p.onLoad(); p.setData({ photos: ['front'] }); await p.recognize();
  assert.equal(p.data.result.description, '服务端故事'); assert.equal(p.data.result.pitch.story, '服务端背景');
  assert.deepEqual(plain(p.data.sellingPoints), ['手绘纹样']); assert.equal(p.data.result.confidence, undefined);
});
test('cloud save requires an actual persisted product id, not an empty success response', async () => {
  const p = page('recognize', { action: async () => ({}) }); p.onLoad(); p.setData({ result: { name: '杯' }, photos: ['front'] });
  await p.saveResult(); assert.equal(p.data.savedId, ''); assert.ok(p.data.error);
});
test('assistant streams native messages and carries server conversation id into next turn', async () => {
  const calls = [];
  const p = page('assistant', { assistant: async (messages, id, delta) => {
    calls.push({ messages: plain(messages), id }); delta('真实'); delta('回复');
    return { text: '真实回复', conversationId: 'conversation-1' };
  } });
  p.onLoad(); p.input(event('你好')); await p.send();
  assert.equal(p.data.messages[1].content, '真实回复'); assert.equal(p.data.conversationId, 'conversation-1');
  p.input(event('继续')); await p.send(); assert.equal(calls[1].id, 'conversation-1'); assert.equal(calls[1].messages.length, 3);
});
test('assistant aborts on unload and ignores late stream and completion', async () => {
  const request = deferred(); let delta, aborted = false;
  request.promise.abort = () => { aborted = true; };
  const p = page('assistant', { assistant: (messages, id, callback) => { delta = callback; return request.promise; } });
  p.onLoad(); p.input(event('问题')); const pending = p.send();
  p.onUnload(); const snapshot = plain(p.data); delta('迟到内容'); request.resolve({ text: '迟到结果', conversationId: 'late' });
  await pending; assert.equal(aborted, true); assert.deepEqual(plain(p.data), snapshot);
});
test('assistant retry does not duplicate the failed user turn', async () => {
  let count = 0;
  const p = page('assistant', { assistant: async messages => {
    count++; if (count === 1) throw new Error('网络失败');
    assert.equal(messages.filter(m => m.role === 'user').length, 1); return { text: '重试成功', conversationId: 'c' };
  } });
  p.onLoad(); p.input(event('问题')); await p.send(); await p.retry();
  assert.equal(p.data.messages.filter(m => m.role === 'user').length, 1); assert.equal(p.data.messages.at(-1).content, '重试成功');
});
test('marketing restores the current real server task on foreground', async () => {
  const calls = []; const p = page('marketing', { invoke: async (name, body) => { calls.push([name, plain(body)]); return scriptState(); } });
  p.onLoad({}); await p.onShow();
  assert.deepEqual(calls[0], ['surprise-script-job', { action: 'current', shop_id: 'shop-1' }]);
  assert.equal(p.data.scriptJobId, 'script-1'); assert.equal(p.data.script.scenes[0].dialogue, '原稿');
});
test('marketing starts only the established unified video script job', async () => {
  let request; const p = page('marketing', { invoke: async (name, body) => { request = [name, plain(body)]; return scriptState({ status: 'script_generating', script: null }); } });
  p.onLoad({}); p.setData({ contentScope: 'ceramics' }); await p.startScript();
  assert.deepEqual(request, ['surprise-script-job', { action: 'start', shop_id: 'shop-1', exclude_asset_ids: [], realism: 'photoreal', content_scope: 'ceramics', replace_current: false }]);
  assert.equal(p.data.status, 'script_generating'); assert.equal(p.data.videoUrl, '');
});
test('edited script is saved before rendering, and render consumes its job id', async () => {
  const calls = []; const p = page('marketing', { invoke: async (name, body) => {
    calls.push([name, plain(body)]);
    return name === 'surprise-marketing-video' ? { ok: true, job_id: 'render-1' } : scriptState({ script: body.script });
  } });
  p.onLoad({}); p.acceptTask(scriptState());
  p.editScript(event('店员修改稿', { part: 'scene', index: 0, field: 'dialogue' })); await p.generateVideo();
  assert.equal(calls[0][1].action, 'save'); assert.equal(calls[0][1].script.scenes[0].dialogue, '店员修改稿');
  assert.deepEqual(calls[1], ['surprise-marketing-video', { script_job_id: 'script-1', shop_id: 'shop-1', style: 'lively', realism: 'photoreal', model: 'doubao-seedance-2-0-260128', resolution: '1080p', preview: false }]);
  assert.equal(p.data.videoJobId, 'render-1'); assert.equal(p.data.status, 'queued');
});
test('script save rejection prevents render and preserves edited script', async () => {
  const names = []; const p = page('marketing', { invoke: async name => { names.push(name); throw new Error('脚本校验失败'); } });
  p.onLoad({}); p.acceptTask(scriptState()); p.editScript(event('保留这段', { part: 'hook', field: 'dialogue' })); await p.generateVideo();
  assert.deepEqual(names, ['surprise-script-job']); assert.equal(p.data.script.hook.dialogue, '保留这段'); assert.equal(p.data.videoJobId, '');
});
test('reference edits use update_assets with real URLs after persisting manual edits', async () => {
  const calls = []; const p = page('marketing', { invoke: async (name, body) => { calls.push(plain(body)); return scriptState({ script: body.script || script() }); } }, { getImageInfo: ({ success }) => success({ width: 1080, height: 1920 }) });
  p.onLoad({}); p.acceptTask(scriptState({ picked_assets: [{ asset_id: 'photo-1', url: 'https://ai.boomeroff.com/store.jpg' }] })); await p.saveReferences();
  assert.equal(calls[0].action, 'save');
  assert.deepEqual(calls[1], { action: 'update_assets', job_id: 'script-1', asset_urls: ['https://ai.boomeroff.com/store.jpg'] });
});
test('marketing task polling never calls a segmented or URL-less render completed', async () => {
  const p = page('marketing', { invoke: async () => ({ status: 'ready_to_stitch', segment_urls: ['https://ai.boomeroff.com/segment.mp4'] }) });
  p.onLoad({}); p.setData({ videoJobId: 'render-1' }); await p.refreshTask();
  assert.equal(p.data.status, 'ready_to_stitch'); assert.equal(p.data.videoUrl, ''); assert.notEqual(p.data.statusLabel, '已完成');
  p.api.invoke = async () => ({ status: 'succeeded', cover_status: 'succeeded', cover_url: 'https://ai.boomeroff.com/cover.jpg' });
  await p.refreshTask(); assert.notEqual(p.data.statusLabel, '已完成');
});
test('marketing suppresses late polling results after unload', async () => {
  const request = deferred(); const p = page('marketing', { invoke: () => request.promise }); p.onLoad({});
  p.setData({ videoJobId: 'render-1' }); const pending = p.refreshTask(); p.onUnload(); const snapshot = plain(p.data);
  request.resolve({ status: 'succeeded', video_url: 'https://ai.boomeroff.com/video.mp4', cover_status: 'succeeded', cover_url: 'https://ai.boomeroff.com/cover.jpg' });
  await pending; assert.deepEqual(plain(p.data), snapshot);
});
test('native asset detail renders video, independent cover, and persisted copy', async () => {
  const p = page('asset', { action: async () => ({ item: videoAsset() }) }); await p.onLoad({ id: 'asset-1' });
  assert.equal(p.data.asset.videoUrl, videoAsset().output_url); assert.equal(p.data.asset.coverUrl, videoAsset().meta.poster_url);
  assert.match(p.data.asset.copyText, /真实文案/);
  assert.match(fs.readFileSync(path.join(root, 'asset/index.wxml'), 'utf8'), /<video\b/);
});
test('asset save does not announce success when native album save fails', async () => {
  const p = page('asset', { action: async () => ({ item: videoAsset() }), saveMedia: async () => { throw new Error('相册权限未授权'); } });
  await p.onLoad({ id: 'asset-1' }); await p.saveVideo(); assert.equal(p.data.notice, ''); assert.match(p.data.error, /相册权限/);
});
test('asset cover saves the independent image and waits for native success', async () => {
  const request = deferred(); const calls = []; const p = page('asset', {
    action: async () => ({ item: videoAsset() }), saveMedia: (url, kind) => { calls.push([url, kind]); return request.promise; },
  });
  await p.onLoad({ id: 'asset-1' }); const pending = p.saveCover(); await Promise.resolve(); await Promise.resolve();
  assert.equal(p.data.notice, ''); request.resolve(); await pending;
  assert.deepEqual(calls, [[videoAsset().meta.poster_url, 'image']]); assert.match(p.data.notice, /已保存/);
});
test('asset withdrawal is rechecked before delivering an original', async () => {
  let withdrawn = false, deliveries = 0; const p = page('asset', { action: async () => ({ item: withdrawn ? null : videoAsset() }), saveMedia: async () => { deliveries++; } });
  await p.onLoad({ id: 'asset-1' }); withdrawn = true; await p.saveVideo(); assert.ok(p.data.error); assert.equal(p.data.notice, ''); assert.equal(deliveries, 0);
});
test('publishing uses real account IDs and reports queued, never published', async () => {
  const calls = []; const p = page('asset', { action: async () => ({ item: videoAsset() }), invoke: async (name, body) => {
    calls.push([name, plain(body)]);
    if (name === 'dispatch-account-list') return { accounts: [{ id: 'account-1', account_name: '门店号', online: true, worker_online: true, cookie_status: 'valid', worker_account_id: 'worker' }] };
    if (name === 'dispatch-job-create') return { job_id: 'publish-1', queued: true };
    return { job: { id: 'publish-1', status: 'queued' }, targets: [] };
  } });
  await p.onLoad({ id: 'asset-1' }); await p.loadAccounts(); p.selectAccount(event('', { id: 'account-1' })); await p.publish();
  const create = calls.find(c => c[0] === 'dispatch-job-create');
  assert.deepEqual(create[1].account_ids, ['account-1']); assert.equal(create[1].asset_id, 'asset-1'); assert.equal(create[1].kind, 'video');
  assert.equal(p.data.publishJobId, 'publish-1'); assert.match(p.data.notice, /队列/); assert.doesNotMatch(p.data.notice, /已发布/);
});
test('publishing retry and cancel call the actual target/job function bodies', async () => {
  const calls = []; const p = page('asset', { invoke: async (name, body) => {
    calls.push([name, plain(body)]); return name === 'dispatch-job-status' ? { job: { id: 'p1', status: 'queued' }, targets: [{ id: 't1', status: 'failed' }] } : { ok: true, queued: true };
  } });
  p._disposed = false; p.setData({ publishJobId: 'p1', publishJob: { status: 'queued' }, targets: [{ id: 't1', status: 'failed' }] });
  await p.retryTarget(event('', { id: 't1' })); await p.cancelPublish();
  assert.ok(calls.some(([name, body]) => name === 'dispatch-job-retry' && body.target_id === 't1'));
  assert.ok(calls.some(([name, body]) => name === 'dispatch-job-cancel' && body.job_id === 'p1'));
});
test('edited clip updates the continuous spoken text and visual beats consumed by one-shot render', () => {
  const p = page('marketing'); p.onLoad({});
  const current = script(); current.visual_beats = [{ visual: '旧门头' }, { visual: '旧货架' }, { visual: '旧结尾' }];
  p.acceptTask(scriptState({ script: current }));
  p.editScript(event('店员新口播', { part: 'scene', index: 0, field: 'dialogue' }));
  p.editScript(event('当前真实货架', { part: 'scene', index: 0, field: 'scene' }));
  assert.equal(p.data.script.continuous_dialogue, '开场，店员新口播，结尾');
  assert.equal(p.data.script.scenes[0].subtitle, '店员新口播');
  assert.equal(p.data.script.visual_beats[1].visual, '当前真实货架');
});
test('applying conversation first confirms the edited script, not only its draft', async () => {
  const calls = []; const p = page('marketing', { invoke: async (name, body) => { calls.push(plain(body)); return scriptState({ script: body.script || script() }); } });
  p.onLoad({}); p.acceptTask(scriptState({ pending_changes: ['简化结尾'] }));
  await p.applyConversation(); assert.equal(calls[0].action, 'save'); assert.equal(calls[1].action, 'apply_conversation');
});
test('render polling shows the actual failed task without silently leaving it running', async () => {
  const p = page('marketing', { invoke: async () => ({ status: 'failed', error: '生成服务拒绝了本次任务' }) });
  p.onLoad({}); p.setData({ videoJobId: 'render-1', status: 'running' }); await p.refreshTask();
  assert.equal(p.data.status, 'failed'); assert.match(p.data.taskError, /拒绝/);
});
test('native album refusal returned as saved false is never success', async () => {
  const p = page('asset', { action: async () => ({ item: videoAsset() }), saveMedia: async () => ({ saved: false }) });
  await p.onLoad({ id: 'asset-1' }); await p.saveVideo(); assert.ok(p.data.error); assert.equal(p.data.notice, '');
});
test('new assistant conversation invalidates an outstanding request', async () => {
  const request = deferred(); let delta;
  const p = page('assistant', { assistant: (messages, id, callback) => { delta = callback; return request.promise; } });
  p.onLoad(); p.input(event('旧问题')); const pending = p.send(); p.newConversation();
  delta('旧片段'); request.resolve({ text: '旧回答', conversationId: 'old' }); await pending;
  assert.deepEqual(plain(p.data.messages), []); assert.equal(p.data.conversationId, ''); assert.equal(p.data.sending, false);
});
test('recognition save delegates photos to the parent uploader without changing the result identity', async () => {
  let request; const p = page('recognize', { action: async (name, body) => { request = [name, plain(body)]; assert.equal(body.result, result); return { item: { id: 'real-product-id' } }; } });
  p.onLoad(); const result = { name: '杯', origin: '待考', sellingPoints: [] }; p.setData({ result, photos: ['front', 'base'] }); await p.saveResult();
  assert.deepEqual(request, ['recognition-save', { result, photos: ['front', 'base'] }]); assert.equal(p.data.savedId, 'real-product-id');
});
test('marketing restoration keeps local edits if draft persistence failed', async () => {
  const p = page('marketing', { invoke: async () => { throw new Error('草稿尚未保存'); } });
  p.onLoad({}); p.acceptTask(scriptState()); p.editScript(event('必须保留', { part: 'hook', field: 'dialogue' }));
  p.onHide(); await p._draftWrite; await p.onShow();
  assert.equal(p.data.script.hook.dialogue, '必须保留'); assert.equal(p.data.dirty, true); assert.match(p.data.error, /草稿/);
});
test('offline publishing accounts cannot be selected, and worker keys never enter page data', async () => {
  const p = page('asset', { invoke: async () => ({ accounts: [{ id: 'a', account_name: '门店', online: false, worker_online: true, worker_account_key: 'private-worker-key' }] }) });
  await p.loadAccounts(); p.selectAccount(event('', { id: 'a' }));
  assert.deepEqual(plain(p.data.selectedAccountIds), []); assert.doesNotMatch(JSON.stringify(p.data), /private-worker-key|worker_account_key/);
});
test('WXML conditionals and loops are expressions, never truthy literal attributes', () => {
  for (const name of ['recognize', 'assistant', 'marketing', 'asset']) {
    const source = fs.readFileSync(path.join(root, name, 'index.wxml'), 'utf8');
    for (const match of source.matchAll(/wx:(?:if|elif|for)="([^"]*)"/g)) {
      assert.match(match[1], /^\{\{[\s\S]+\}\}$/, `${name}: ${match[0]} must use expression binding`);
    }
    for (const match of source.matchAll(/\{\{[\s\S]*?\}\}/g)) {
      assert.doesNotMatch(match[0], /&(?:amp|lt|gt|quot|apos);/, `${name}: WXML expressions use raw operators, not HTML entities`);
    }
  }
});
test('original asset delivery rejects arbitrary hosts, another tenant and image transforms', async () => {
  for (const url of [
    'https://attacker.example/original.mp4',
    'https://another-tenant.supabase.co/storage/v1/object/public/marketing-videos/v.mp4',
    'https://ai.boomeroff.com/video.mp4?width=320',
    'https://ai.boomeroff.com:444/video.mp4',
    'https://user@ai.boomeroff.com/video.mp4',
    'https://ai.boomeroff.com/a/%2e%2e/video.mp4',
  ]) {
    const row = videoAsset(); row.output_url = url; let deliveries = 0;
    const p = page('asset', { action: async () => ({ item: row }), saveMedia: async () => { deliveries++; } });
    await p.onLoad({ id: 'asset-1' }); await p.saveVideo(); assert.ok(p.data.error); assert.equal(p.data.asset.videoUrl, ''); assert.equal(deliveries, 0, url);
  }
});
test('independent cover enforces the same original-file source policy', async () => {
  const row = videoAsset(); row.meta.poster_url = 'https://attacker.example/cover.jpg'; let deliveries = 0;
  const p = page('asset', { action: async () => ({ item: row }), saveMedia: async () => { deliveries++; } });
  await p.onLoad({ id: 'asset-1' }); await p.saveCover(); assert.ok(p.data.error); assert.equal(p.data.notice, ''); assert.equal(deliveries, 0);
});
test('foreground can retry a failed draft write without discarding edits', async () => {
  let fail = true;
  const p = page('marketing', { invoke: async (name, body) => {
    if (fail) throw new Error('网络中断');
    return scriptState({ script: body.script || script() });
  } });
  p.onLoad({}); p.acceptTask(scriptState()); p.editScript(event('待保存稿', { part: 'hook', field: 'dialogue' }));
  p.onHide(); await p._draftWrite; fail = false; await p.onShow();
  assert.equal(p.data.error, ''); assert.equal(p.data.dirty, false);
});
test('album cancel preserves the current successful recognition and all photos', async () => {
  const p = page('recognize', {}, { chooseMedia: ({ fail }) => fail({ errMsg: 'chooseMedia:fail cancel' }) });
  p.onLoad(); p.setData({ result: { name: '已有结果' }, photos: ['front'] }); await p.pickAlbum();
  assert.deepEqual(plain(p.data.photos), ['front']); assert.equal(p.data.result.name, '已有结果'); assert.equal(p.data.error, '');
});
test('rapid shutter taps share one pending shot and never open another capture', async () => {
  let success, count = 0;
  const p = page('recognize', {}, { createCameraContext: () => ({ takePhoto(options) { count++; success = options.success; } }) });
  p.onLoad(); p.cameraReady(); const pending = p.takePhoto(); p.takePhoto();
  success({ tempImagePath: 'front' }); await pending; assert.equal(count, 1); assert.deepEqual(plain(p.data.photos), ['front']);
});
test('recognition save retries retain the same result object for parent idempotency', async () => {
  const seen = []; const p = page('recognize', { action: async (name, body) => { seen.push(body.result); if (seen.length === 1) throw new Error('响应超时'); return { item: { id: 'product-1' } }; } });
  p.onLoad(); const result = { name: '杯' }; p.setData({ result, photos: ['front'] }); await p.saveResult(); await p.saveResult();
  assert.equal(seen[0], result); assert.equal(seen[1], result); assert.equal(p.data.savedId, 'product-1');
});
test('changing selected photos invalidates recognition and its save eligibility', async () => {
  let saves = 0; const p = page('recognize', { action: async () => { saves++; } }); p.onLoad();
  p.setData({ result: { name: '旧结果' }, savedId: 'old', photos: ['front', 'base'] }); p.removePhoto(event('', { index: 0 })); await p.saveResult();
  assert.equal(p.data.result, null); assert.equal(p.data.savedId, ''); assert.equal(saves, 0);
});
test('late cloud-save receipt cannot mark a replacement recognition result saved', async () => {
  const request = deferred(); const p = page('recognize', { action: () => request.promise }); p.onLoad();
  p.setData({ result: { name: '旧结果' }, photos: ['front'] }); const pending = p.saveResult();
  p.setData({ result: { name: '新结果' }, photos: ['new'], savedId: '', notice: '' }); request.resolve({ item: { id: 'old-product' } }); await pending;
  assert.equal(p.data.savedId, ''); assert.equal(p.data.notice, '');
});
test('recognition never claims cloud persistence from an explicitly failed or preview receipt', async () => {
  for (const response of [{ ok: false, item: { id: 'x' } }, { persisted: false, item: { id: 'example' } }, { item: { id: {} } }]) {
    const p = page('recognize', { action: async () => response }); p.onLoad(); p.setData({ result: { name: '杯' }, photos: ['front'] }); await p.saveResult();
    assert.equal(p.data.savedId, ''); assert.ok(p.data.error);
  }
});
test('assistant drops callbacks after employee/store authority changes', async () => {
  const request = deferred(); let delta;
  const p = page('assistant', { assistant: (messages, id, callback) => { delta = callback; return request.promise; } });
  let current = p.session.get(); p.session.get = () => current;
  p.onLoad(); p.input(event('旧门店问题')); const pending = p.send();
  current = { ...current, shop: { id: 'shop-2' }, scopeVersion: 2 };
  const snapshot = plain(p.data); delta('旧门店回复'); request.resolve({ text: '旧门店结果', conversationId: 'old' }); await pending;
  assert.equal(p.data.messages[1].content, snapshot.messages[1].content);
  p.onShow(); assert.deepEqual(plain(p.data.messages), []); assert.equal(p.data.conversationId, '');
});
test('marketing library drops old-store responses even without a foreground lifecycle event', async () => {
  const request = deferred(); const p = page('marketing', { action: () => request.promise });
  let current = p.session.get(); p.session.get = () => current; p.onLoad({});
  const pending = p.loadLibrary(); current = { ...current, shop: { id: 'shop-2' }, scopeVersion: 3 };
  request.resolve({ items: [videoAsset()] }); await pending; assert.deepEqual(plain(p.data.items), []);
});
test('asset detail drops pending old-scope data and media delivery', async () => {
  const request = deferred(); let deliveries = 0;
  const p = page('asset', { action: () => request.promise, saveMedia: async () => { deliveries++; } });
  let current = p.session.get(); p.session.get = () => current;
  const pending = p.onLoad({ id: 'asset-1' }); current = { ...current, scopeVersion: 9 };
  request.resolve({ item: videoAsset() }); await pending; assert.equal(p.data.asset, null); assert.equal(deliveries, 0);
});
test('marketing references use approved media sources and exclude unexpected provider credentials', () => {
  const p = page('marketing'); p.onLoad({});
  p.acceptTask(scriptState({ picked_assets: [
    { asset_id: 'good', url: 'https://ai.boomeroff.com/reference.jpg', summary: '真实门头', access_token: 'provider-secret' },
    { asset_id: 'bad', url: 'https://untrusted.example/photo.jpg' },
  ] }));
  assert.equal(p.data.references.length, 1); assert.equal(p.data.selectedReferences.length, 1);
  assert.doesNotMatch(JSON.stringify(p.data.references), /provider-secret|access_token/);
});
test('all remote prose remains native text rather than executable or unescaped HTML', () => {
  for (const name of ['recognize', 'assistant', 'marketing', 'asset']) {
    const source = fs.readFileSync(path.join(root, name, 'index.wxml'), 'utf8');
    assert.doesNotMatch(source, /<web-view\b|<script\b|<rich-text\b|v-html|innerHTML|<iframe\b/i);
    assert.match(source, /preview/);
  }
});
test('native media completion cannot repopulate a new authority scope with an old asset', async () => {
  const request = deferred(); let started;
  const saving = new Promise(resolve => { started = resolve; });
  const p = page('asset', { action: async () => ({ item: videoAsset() }), saveMedia: () => { started(); return request.promise; } });
  let current = p.session.get(); p.session.get = () => current; await p.onLoad({ id: 'asset-1' });
  const pending = p.saveVideo(); await saving;
  current = { ...current, shop: { id: 'shop-2' } }; p.setData({ asset: null, notice: '' }); request.resolve({ saved: true }); await pending;
  assert.equal(p.data.asset, null); assert.equal(p.data.notice, '');
});
test('marketing current-task restoration ignores replies after a scope-version change', async () => {
  const request = deferred(); const p = page('marketing', { invoke: () => request.promise });
  let current = p.session.get(); p.session.get = () => current; p.onLoad({});
  const pending = p.restore(); current = { ...current, scopeVersion: 4 }; request.resolve(scriptState()); await pending;
  assert.equal(p.data.script, null); assert.equal(p.data.scriptJobId, '');
});
test('backend original-source failures have precise Chinese labels before generic generation state', async () => {
  for (const [code, expected] of [
    ['provider_url_not_persisted', /原文件尚未持久化/],
    ['storage_not_accessible', /无权读取/],
    ['storage_missing', /原文件缺失/],
  ]) {
    const row = videoAsset(); row.output_url = null; row.source_error = code;
    let downloads = 0;
    const p = page('asset', { action: async () => ({ item: row }), saveMedia: async () => { downloads++; } });
    await p.onLoad({ id: 'asset-1' });
    assert.match(p.data.asset.sourceError, expected); assert.match(p.data.asset.statusLabel, expected);
    assert.equal(p.data.asset.ready, false); assert.equal(p.data.asset.videoUrl, '');
    await p.saveVideo(); assert.match(p.data.error, expected); assert.equal(downloads, 0);
    assert.match(fs.readFileSync(path.join(root, 'asset/index.wxml'), 'utf8'), /\{\{asset\.sourceError\}\}/);
  }
});
test('server source rejection wins over a residual provider URL without loosening the whitelist', async () => {
  const row = videoAsset(); row.source_error = 'provider_url_not_persisted';
  const p = page('asset', { action: async () => ({ item: row }) }); await p.onLoad({ id: 'asset-1' });
  assert.equal(p.data.asset.originalUrl, ''); assert.equal(p.data.asset.ready, false); assert.match(p.data.asset.sourceError, /尚未持久化/);
  assert.equal(p.data.asset.coverUrl, row.meta.poster_url); assert.match(p.data.asset.copyText, /真实文案/);
});
test('unknown backend source errors stay unavailable instead of being misreported as generation pending', async () => {
  for (const code of ['new_code_not_in_contract', 'constructor', '__proto__']) {
    const row = videoAsset(); row.output_url = null; row.source_error = code;
    const p = page('asset', { action: async () => ({ item: row }) }); await p.onLoad({ id: 'asset-1' });
    assert.match(p.data.asset.sourceError, /原文件暂不可用/); assert.notEqual(p.data.asset.statusLabel, '尚未完成');
    assert.doesNotMatch(p.data.asset.sourceError, /new_code_not_in_contract|constructor|__proto__/);
  }
});
test('empty video-copy metadata falls back to the actual saved publish copy', async () => {
  const row = videoAsset(); row.meta.video_copy = {}; row.meta.publish_copy = { title: '云端发布标题', body: '云端发布正文', topics: ['#中古'] };
  const p = page('asset', { action: async () => ({ item: row }) }); await p.onLoad({ id: 'asset-1' });
  assert.equal(p.data.asset.copyTitle, '云端发布标题'); assert.match(p.data.asset.copyText, /云端发布正文/); assert.match(p.data.asset.copyText, /#中古/);
});

const photoAsset = id => ({ id, kind: 'photo', output_url: `https://ai.boomeroff.com/${id}.jpg`, meta: {} });
test('marketing library consumes zero-based paginated DTO and deduplicates by id', async () => {
  const calls = [];
  const first = [videoAsset(), ...Array.from({ length: 19 }, (_, i) => photoAsset('first-' + i))];
  const p = page('marketing', { action: async (name, params) => {
    calls.push([name, plain(params)]);
    return params.page === 0 ? { items: first, page: 0, has_more: true }
      : { items: [photoAsset('first-0'), photoAsset('b')], page: 1, has_more: false };
  } });
  p.onLoad({ tab: 'library' }); await p.loadLibrary(); await p.loadMoreLibrary(); await p.loadMoreLibrary();
  assert.deepEqual(calls, [
    ['marketing-assets', { page: 0, page_size: 20 }], ['marketing-assets', { page: 1, page_size: 20 }],
  ]);
  assert.deepEqual(plain(p.data.items.map(x => x.id)), first.map(x => x.id).concat('b'));
  assert.equal(p.data.items.length, 21);
  assert.equal(p.data.libraryPage, 1); assert.equal(p.data.libraryHasMore, false);
});
test('reference picker paginates authorized photos, deduplicates ids and retains selection', async () => {
  const calls = [];
  const p = page('marketing', { action: async (name, params) => {
    calls.push([name, plain(params)]);
    return params.page === 0 ? { items: [photoAsset('a'), videoAsset(), { ...photoAsset('bad'), source_error: 'storage_not_accessible' }], page: 0, has_more: true }
      : { items: [photoAsset('a'), photoAsset('b')], page: 1, has_more: false };
  } });
  p.onLoad({}); await p.openReferences(); p.toggleReference(event('', { url: photoAsset('a').output_url }));
  await p.loadMoreReferences(); await p.loadMoreReferences();
  assert.deepEqual(calls, [
    ['marketing-assets', { page: 0, page_size: 20, kind: 'photo' }], ['marketing-assets', { page: 1, page_size: 20, kind: 'photo' }],
  ]);
  assert.deepEqual(plain(p.data.referenceItems.map(x => x.id)), ['a', 'b']);
  assert.equal(p.data.referenceItems[0].selected, true);
  assert.deepEqual(plain(p.data.selectedReferences), [photoAsset('a').output_url]);
  assert.equal(p.data.referenceHasMore, false);
});
test('both pagers retain items, cursor and selection on failure and retry the same page', async () => {
  for (const references of [false, true]) {
    let fail = true; const pages = [];
    const p = page('marketing', { action: async (name, params) => {
      pages.push(params.page);
      if (params.page === 1 && fail) throw new Error('分页连接失败');
      return { items: [photoAsset(params.page ? 'b' : 'a')], page: params.page, has_more: params.page === 0 };
    } });
    p.onLoad({ tab: references ? 'create' : 'library' });
    await (references ? p.openReferences() : p.loadLibrary());
    p.setData({ selectedReferences: [photoAsset('a').output_url] });
    const more = () => references ? p.loadMoreReferences() : p.loadMoreLibrary();
    await more();
    const prefix = references ? 'reference' : 'library', list = references ? 'referenceItems' : 'items';
    assert.deepEqual(plain(p.data[list].map(x => x.id)), ['a']);
    assert.equal(p.data[prefix + 'Page'], 0); assert.equal(p.data[prefix + 'HasMore'], true);
    assert.equal(p.data[prefix + 'Loading'], false); assert.match(p.data[prefix + 'Error'], /分页连接失败/);
    assert.deepEqual(plain(p.data.selectedReferences), [photoAsset('a').output_url]);
    fail = false; await more();
    assert.deepEqual(pages, [0, 1, 1]); assert.equal(p.data[prefix + 'Error'], '');
    assert.deepEqual(plain(p.data[list].map(x => x.id)), ['a', 'b']);
  }
});
test('current pagination authentication failure still reaches the shared run expiry handler', async () => {
  const error = Object.assign(new Error('员工登录已过期'), { status: 401 });
  const p = page('marketing', { action: async () => { throw error; } }); p.onLoad({ tab: 'library' });
  p.run = async task => assert.rejects(task, value => value === error);
  await p.loadLibrary(); assert.equal(p.data.libraryLoading, false);
});
test('page requests are single-flight and an empty filtered page still follows has_more', async () => {
  const pending = deferred(); let calls = 0;
  const p = page('marketing', { action: async (name, params) => {
    calls++; return calls === 1 ? { items: [videoAsset()], page: 0, has_more: true } : pending.promise;
  } }); p.onLoad({}); await p.openReferences();
  assert.equal(p.data.referenceItems.length, 0); assert.equal(p.data.referenceHasMore, true);
  const loading = p.loadMoreReferences(); await p.loadMoreReferences(); assert.equal(calls, 2);
  pending.resolve({ items: [photoAsset('next')], page: 1, has_more: false }); await loading;
  assert.equal(p.data.referenceItems[0].id, 'next');
});
test('late pages and failures cannot cross tab, picker, store or unload boundaries', async () => {
  for (const boundary of ['tab', 'picker', 'store', 'hide', 'unload']) {
    for (const references of (boundary === 'picker' ? [true] : [false, true])) {
      for (const reject of [false, true]) {
        const request = deferred(); let count = 0;
        const p = page('marketing', {
          action: async () => ++count === 1 ? { items: [photoAsset('kept')], page: 0, has_more: true } : request.promise,
          invoke: async () => scriptState(),
        });
        let current = p.session.get(); p.session.get = () => current;
        p.onLoad({ tab: references ? 'create' : 'library' });
        await (references ? p.openReferences() : p.loadLibrary());
        const pending = references ? p.loadMoreReferences() : p.loadMoreLibrary();
        if (boundary === 'tab') {
          assert.equal(p.data.loading, false);
          const tab = references ? 'library' : 'create';
          // Only the old next page is delayed; the newly opened tab has its own response.
          p.api.action = async () => ({ items: [], page: 0, has_more: false });
          await p.switchTab(event('', { tab })); assert.equal(p.data.tab, tab);
        }
        if (boundary === 'picker') p.closeReferences();
        if (boundary === 'store') current = { ...current, shop: { id: 'new-shop' }, scopeVersion: 2 };
        if (boundary === 'hide') p.onHide();
        if (boundary === 'unload') p.onUnload();
        const snapshot = plain(p.data);
        if (reject) request.reject(new Error('旧分页失败')); else request.resolve({ items: [photoAsset('late')], page: 1, has_more: false });
        await pending; assert.deepEqual(plain(p.data), snapshot, boundary + ' must ignore late data and errors');
      }
    }
  }
});
test('a refreshed first page wins over a previous delayed next page', async () => {
  const request = deferred(); let count = 0;
  const p = page('marketing', { action: async () => {
    count++; if (count === 2) return request.promise;
    return { items: [photoAsset(count === 1 ? 'old' : 'fresh')], page: 0, has_more: true };
  } }); p.onLoad({ tab: 'library' }); await p.loadLibrary();
  const pending = p.loadMoreLibrary(); await p.loadLibrary();
  request.resolve({ items: [photoAsset('late')], page: 1, has_more: false }); await pending;
  assert.deepEqual(plain(p.data.items.map(x => x.id)), ['fresh']); assert.equal(p.data.libraryPage, 0);
});
test('reference submission confirms portrait dimensions before any script mutation', async () => {
  for (const dimensions of [{ width: 1920, height: 1080 }, { width: 100, height: 100 }, null, { width: 0, height: 1 }]) {
    const calls = [];
    const p = page('marketing', { invoke: async (name, body) => { calls.push(body); return scriptState(); } }, {
      getImageInfo: ({ success, fail }) => dimensions ? success(dimensions) : fail({ errMsg: 'download failed' }),
    });
    p.onLoad({}); p.acceptTask(scriptState({ picked_assets: [{ asset_id: 'a', url: photoAsset('a').output_url }] }));
    await p.saveReferences();
    assert.equal(calls.length, 0); assert.match(p.data.error, dimensions && dimensions.width > 0 ? /竖图|高.*宽/ : /无法确认.*尺寸/);
    assert.deepEqual(plain(p.data.selectedReferences), [photoAsset('a').output_url]);
  }
});
test('unauthorized references and more than eight selections cannot be silently submitted', async () => {
  let calls = 0;
  const p = page('marketing', { invoke: async () => { calls++; return scriptState(); } }, { getImageInfo: ({ success }) => success({ width: 100, height: 200 }) });
  p.onLoad({}); p.acceptTask(scriptState());
  p.setData({ selectedReferences: [photoAsset('not-listed').output_url] }); await p.saveReferences();
  assert.equal(calls, 0); assert.match(p.data.error, /授权|素材库/);
  const photos = Array.from({ length: 9 }, (_, i) => photoAsset(String(i)));
  p.setData({ referenceItems: photos.map(x => ({ id: x.id, originalUrl: x.output_url })), selectedReferences: photos.map(x => x.output_url) });
  await p.saveReferences(); assert.equal(calls, 0); assert.match(p.data.error, /8/);
});
test('image-info completion after picker close cannot update assets', async () => {
  let complete, calls = 0;
  const p = page('marketing', { invoke: async () => { calls++; return scriptState(); } }, { getImageInfo: ({ success }) => { complete = success; } });
  p.onLoad({}); p.acceptTask(scriptState({ picked_assets: [{ asset_id: 'a', url: photoAsset('a').output_url }] }));
  p.setData({ referencePicker: true }); const pending = p.saveReferences();
  p.closeReferences(); complete({ width: 100, height: 200 }); await pending; assert.equal(calls, 0);
});
test('both native lists expose load-more controls and local errors', () => {
  const wxml = fs.readFileSync(path.join(root, 'marketing/index.wxml'), 'utf8');
  assert.match(wxml, /bindtap="loadMoreLibrary"/); assert.match(wxml, /bindtap="loadMoreReferences"/);
  assert.match(wxml, /\{\{libraryError\}\}/); assert.match(wxml, /\{\{referenceError\}\}/);
});
test('Round7 original errors block downloads but preserve separately valid cover and copy', async () => {
  for (const [code, message] of [['signed_url_expired', /原文件.*签名.*过期/], ['source_path_mismatch', /原文件.*路径.*不一致/]]) {
    const row = videoAsset(); row.source_error = code;
    let downloads = 0;
    const p = page('asset', { action: async () => ({ item: row }), saveMedia: async () => { downloads++; } });
    await p.onLoad({ id: row.id }); await p.saveVideo();
    assert.match(p.data.asset.sourceError, message); assert.match(p.data.error, message); assert.equal(downloads, 0);
    assert.equal(p.data.asset.originalUrl, ''); assert.equal(p.data.asset.videoUrl, ''); assert.equal(p.data.asset.ready, false);
    assert.equal(p.data.asset.coverUrl, row.meta.poster_url); assert.match(p.data.asset.copyText, /真实文案/);
  }
});
test('Round7 expired or unknown cover errors suppress residual cover URL and block only cover download', async () => {
  for (const code of ['signed_url_expired', 'unknown_cover_error', 'constructor', '__proto__']) {
    const row = videoAsset(); row.cover_error = code;
    let downloads = 0;
    const p = page('asset', { action: async () => ({ item: row }), saveMedia: async () => { downloads++; return { saved: true }; } });
    await p.onLoad({ id: row.id }); assert.equal(p.data.asset.ready, true); assert.equal(p.data.asset.coverUrl, '');
    assert.match(p.data.asset.coverError, code === 'signed_url_expired' ? /封面.*签名.*过期/ : /封面.*不可用/);
    await p.saveCover(); assert.equal(downloads, 0); assert.match(p.data.error, /封面/);
    await p.saveVideo(); assert.equal(downloads, 1);
  }
  assert.match(fs.readFileSync(path.join(root, 'asset/index.wxml'), 'utf8'), /\{\{asset\.coverError\}\}/);
});
test('Round7 authorized same-project signed originals remain usable with each output_source', async () => {
  const { supabaseUrl } = require('../miniprogram/config');
  for (const output_source of ['fresh_signed', 'stored_signed', 'stored_public']) {
    const row = videoAsset(); row.output_source = output_source;
    row.output_url = supabaseUrl + '/storage/v1/object/sign/marketing-videos/shop/original.mp4?token=valid';
    const p = page('asset', { action: async () => ({ item: row }) }); await p.onLoad({ id: row.id });
    assert.equal(p.data.asset.ready, true); assert.equal(p.data.asset.originalUrl, row.output_url);
  }
});

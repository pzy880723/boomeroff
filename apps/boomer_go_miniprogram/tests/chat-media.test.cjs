const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../miniprogram/shared/api');
const me = '11111111-1111-4111-8111-111111111111';
const peer = '22222222-2222-4222-8222-222222222222';
const config = { supabaseUrl: 'https://project.supabase.co', publicKey: 'public-anon' };
function setup(wx, invoke) {
  let revision = 0;
  const session = { get: () => ({ userId: me, shop: { id: 'shop' } }), revision: () => revision, token: () => 'employee-token', ensureFresh: async () => {} };
  return { api: createApi({ wx, config, session, invoke }), change: () => revision++ };
}
test('native chat uploads original file to the current users private directory', async () => {
  let upload;
  const { api } = setup({
    getFileSystemManager: () => ({ stat: r => r.success({ stats: { size: 1234 } }) }),
    uploadFile: r => { upload = r; r.success({ statusCode: 200, data: JSON.stringify({ Key: r.url.split('/object/')[1] }) }); }
  });
  const att = await api.uploadChatAttachment({ path: 'wxfile://picture.png', name: '商品照片.png', kind: 'image' });
  assert.match(upload.url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/chat-attachments\/11111111-1111-4111-8111-111111111111\/[\w-]+\.png$/);
  assert.equal(upload.filePath, 'wxfile://picture.png');
  assert.equal(upload.name, 'file');
  assert.equal(upload.header.Authorization, 'Bearer employee-token');
  assert.equal(upload.header['x-upsert'], 'false');
  assert.equal(att.size, 1234);
  assert.equal(att.mime, 'image/png');
  assert.equal(att.name, '商品照片.png');
  assert.match(att.storage_path, new RegExp('^' + me + '/'));
});
test('chat upload rejects oversized or remote files before sending credentials', async () => {
  let uploads = 0;
  const { api } = setup({ getFileSystemManager: () => ({ stat: r => r.success({ stats: { size: 41943041 } }) }), uploadFile: () => uploads++ });
  await assert.rejects(api.uploadChatAttachment({ path: 'wxfile://big.mp4', name: 'big.mp4', kind: 'video' }), /40MB/);
  await assert.rejects(api.uploadChatAttachment({ path: 'https://evil.test/a.png', name: 'a.png', kind: 'image' }), /本地/);
  assert.equal(uploads, 0);
});
test('unconfirmed or mismatched upload receipt cannot become a sendable attachment', async () => {
  const { api } = setup({ getFileSystemManager: () => ({ stat: r => r.success({ stats: { size: 20 } }) }), uploadFile: r => r.success({ statusCode: 200, data: '{"Key":"chat-attachments/other/a.png"}' }) });
  await assert.rejects(api.uploadChatAttachment({ path: 'wxfile://a.png', name: 'a.png', kind: 'image' }), /确认/);
});
test('late upload from an old identity cannot attach to the new employee draft', async () => {
  let finish;
  const { api, change } = setup({ getFileSystemManager: () => ({ stat: r => r.success({ stats: { size: 20 } }) }), uploadFile: r => { finish = () => r.success({ statusCode: 200, data: JSON.stringify({ Key: r.url.split('/object/')[1] }) }); } });
  const task = api.uploadChatAttachment({ path: 'wxfile://a.jpg', name: 'a.jpg', kind: 'image' });
  await new Promise(resolve => setImmediate(resolve));
  change(); finish();
  await assert.rejects(task, error => error.code === 'stale_operation');
});
function message(url, kind = 'file', name = '说明.pdf') {
  return { id: 'message', sender_id: peer, receiver_id: me, attachment: { kind, url, name, error: null } };
}
const ownUrl = 'https://project.supabase.co/storage/v1/object/sign/chat-attachments/' + peer + '/guide.pdf?token=signed-token';
test('native file preview downloads without bearer and opens the original document', async () => {
  let download, opened;
  const { api } = setup({ downloadFile: r => { download = r; r.success({ statusCode: 200, tempFilePath: 'wxfile://original' }); }, openDocument: r => { opened = r; r.success(); } });
  await api.openChatAttachment(message(ownUrl));
  assert.equal(download.header, undefined);
  assert.equal(opened.filePath, 'wxfile://original');
  assert.equal(opened.fileType, 'pdf');
  assert.equal(opened.showMenu, true);
});
test('chat media refuses untrusted hosts, paths, participants and expired sources', async () => {
  let calls = 0;
  const { api } = setup({ downloadFile: () => calls++, previewImage: () => calls++ });
  for (const url of [ownUrl.replace('project.supabase.co', 'evil.test'), ownUrl.replace(peer, me), ownUrl.replace('/object/sign/', '/render/image/sign/'), ownUrl + '&width=100']) {
    await assert.rejects(api.openChatAttachment(message(url)), /附件/);
  }
  await assert.rejects(api.openChatAttachment(Object.assign(message(ownUrl), { receiver_id: 'other' })), /附件/);
  const expired = message(ownUrl); expired.attachment.error = 'attachment_expired';
  await assert.rejects(api.openChatAttachment(expired), /附件/);
  assert.equal(calls, 0);
});
test('changing identity during a document download prevents opening old employee data', async () => {
  let opened = false;
  const value = setup({ downloadFile: r => { value.change(); r.success({ statusCode: 200, tempFilePath: 'temp' }); }, openDocument: () => { opened = true; } });
  await assert.rejects(value.api.openChatAttachment(message(ownUrl)), error => error.code === 'stale_operation');
  assert.equal(opened, false);
});
test('identity change while reading file metadata prevents any old upload request', async () => {
  let finish, uploads = 0;
  const value = setup({ getFileSystemManager: () => ({ stat: r => { finish = () => r.success({ stats: { size: 10 } }); } }), uploadFile: () => uploads++ });
  const task = value.api.uploadChatAttachment({ path: 'wxfile://a.png', name: 'a.png', kind: 'image' });
  await new Promise(resolve => setImmediate(resolve));
  value.change(); finish();
  await assert.rejects(task, error => error.code === 'stale_operation');
  assert.equal(uploads, 0);
});
test('validated image and video attachments use native preview APIs without credentials', async () => {
  let image, video;
  const { api } = setup({ previewImage: r => { image = r; r.success(); }, previewMedia: r => { video = r; r.success(); } });
  await api.openChatAttachment(message(ownUrl, 'image', 'photo.png'));
  await api.openChatAttachment(message(ownUrl, 'video', 'clip.mp4'));
  assert.deepEqual(image.urls, [ownUrl]);
  assert.equal(image.header, undefined);
  assert.equal(video.sources[0].url, ownUrl);
  assert.equal(video.sources[0].type, 'video');
  assert.equal(video.header, undefined);
});

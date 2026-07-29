import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildDefaultAccountSelection,
  isPublishableAccount,
  resolvePublishDraft,
} from '../src/lib/publishFlow.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('发布草稿优先读取 AIGC 已定型的 video_copy', () => {
  const draft = resolvePublishDraft({
    output_text: '旧正文',
    tags: ['旧标签'],
    meta: {
      title: '旧标题',
      video_copy: {
        title: '固定标题',
        body: '固定正文',
        hashtags: ['#上海探店', '中古杂货'],
      },
    },
  });

  assert.deepEqual(draft, {
    title: '固定标题',
    body: '固定正文',
    tagsRaw: '上海探店 中古杂货',
  });
});

test('只把在线、登录有效且支持当前素材的五平台账号设为默认选中', () => {
  const accounts = [
    { id: 'xhs-ok', platform: 'xhs', cookie_status: 'valid', online: true, worker_account_id: 1 },
    { id: 'douyin-expired', platform: 'douyin', cookie_status: 'expired', online: true, worker_account_id: 2 },
    { id: 'kuaishou-offline', platform: 'kuaishou', cookie_status: 'valid', online: false, worker_account_id: 3 },
    { id: 'wechat-ok', platform: 'wechat_video', cookie_status: 'valid', online: true, worker_account_id: 4 },
    { id: 'dianping-ok', platform: 'dianping', cookie_status: 'valid', online: true, worker_account_key: 'dp-main' },
    { id: 'bilibili-ok', platform: 'bilibili', cookie_status: 'valid', online: true, worker_account_id: 6 },
  ];

  assert.equal(isPublishableAccount(accounts[0]), true);
  assert.equal(isPublishableAccount(accounts[1]), false);
  assert.equal(isPublishableAccount(accounts[2]), false);
  assert.deepEqual(
    buildDefaultAccountSelection(accounts, (platform) => platform !== 'wechat_video'),
    { 'xhs-ok': true, 'dianping-ok': true },
  );
});

test('发布中心首页不再自动重定向，左上角返回营销中心', () => {
  const source = read('../src/pages/marketing/dispatch/DispatchHome.tsx');
  assert.doesNotMatch(source, /nav\(['"]\/me\/marketing\/dispatch\/workbench['"],\s*\{\s*replace:\s*true\s*\}\)/);
  assert.match(source, /PageHeader[^>]+back=["']\/me\/marketing["']/);
  assert.match(source, /发布一条内容/);
});

test('素材库视频保留去发布入口，并携带当前素材 ID', () => {
  const source = read('../src/components/marketing/AssetDetailDialog.tsx');
  assert.match(source, /dispatch\/workbench\?asset_id=\$\{asset\.id\}/);
  assert.match(source, /去发布|一键发布到自媒体平台/);
});

test('旧的一键发布地址也会把素材 ID 带进新建发布', () => {
  const source = read('../src/App.tsx');
  assert.match(source, /asset_id=\$\{assetId\}/);
});

test('发布后端拒绝素材门店和账号门店不一致', () => {
  const source = read('../supabase/functions/dispatch-job-create/index.ts');
  assert.match(source, /asset\.shop_id\s*!==\s*shopId/);
  assert.match(source, /素材与发布账号不属于同一门店/);
});

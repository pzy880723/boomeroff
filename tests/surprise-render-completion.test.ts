import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildSurpriseCoverCompletion,
  buildSurpriseVideoReadyUpdate,
  readSourceScriptJobId,
} from '../supabase/functions/_shared/surprise-render-completion.ts';

test('reads the source surprise script job from the Seedance render payload', () => {
  assert.equal(readSourceScriptJobId({
    __render_payload: { source_script_job_id: 'script-job-1' },
  }), 'script-job-1');
  assert.equal(readSourceScriptJobId({}), null);
});

test('marks the source task as covering as soon as the video is ready', () => {
  const update = buildSurpriseVideoReadyUpdate({
    sourceMeta: { flow: 'surprise', consumed: true, render_job_id: 'render-job-1' },
    renderJobId: 'render-job-1',
    finalVideoUrl: 'https://cdn/video.mp4',
    assetId: 'asset-1',
  });

  assert.equal(update.status, 'rendering');
  assert.equal(update.final_video_url, 'https://cdn/video.mp4');
  assert.equal(update.meta.surprise_stage, 'covering');
  assert.equal(update.meta.generated_asset_id, 'asset-1');
});

test('marks the source task done when the cover worker finishes', () => {
  const update = buildSurpriseCoverCompletion({
    sourceMeta: { flow: 'surprise', consumed: true, surprise_stage: 'covering' },
    renderJobId: 'render-job-1',
    finalVideoUrl: 'https://cdn/video-faststart.mp4',
    coverUrl: 'https://cdn/cover.jpg',
    assetId: 'asset-1',
  });

  assert.equal(update.status, 'done');
  assert.equal(update.final_video_url, 'https://cdn/video-faststart.mp4');
  assert.equal(update.cover_url, 'https://cdn/cover.jpg');
  assert.equal(update.meta.surprise_stage, 'completed');
});

test('polling never synchronously mirrors a 1080p TOS video before responding', () => {
  const source = readFileSync(
    new URL('../supabase/functions/poll-marketing-video/index.ts', import.meta.url),
    'utf8',
  );
  const updateAssetBody = source.slice(
    source.indexOf('async function updateAssetMeta'),
    source.indexOf('async function syncSurpriseSourceVideoReady'),
  );

  assert.doesNotMatch(updateAssetBody, /await\s+mirrorTosVideoToStorage/);
  assert.match(updateAssetBody, /stream_delivery_status\s*=\s*"queued"/);
  assert.match(source, /syncSurpriseSourceVideoReady/);
});

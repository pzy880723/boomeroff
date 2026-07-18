# Surprise Background Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the surprise script stage as a recoverable backend job, reject incomplete or repetitive scripts, keep subtitles and dialogue identical, freeze publish copy, and save native downloads directly to the gallery.

**Architecture:** Reuse `video_generation_jobs` for a pre-render draft stage and add one Edge Function that starts, polls, saves, and discards surprise drafts. Upgrade `director-create-job` so an approved draft becomes the same render job. Keep deterministic script validation in the shared policy module and keep asset copy/download decisions in small frontend helpers.

**Tech Stack:** React, TypeScript, Supabase Edge Functions (Deno), Capacitor Filesystem/Media, Node test runner with `tsx`.

---

### Task 1: Enforce script quality before normalization

**Files:**
- Modify: `tests/surprise-script-policy.test.ts`
- Modify: `supabase/functions/_shared/surprise-script-policy.ts`
- Modify: `supabase/functions/_shared/surprise-one-shot.ts`
- Modify: `supabase/functions/generate-marketing-video-script/index.ts`

- [x] Add failing tests for short dialogue, repeated six-character phrases, and subtitle/dialogue mismatch.
- [x] Run `npx --yes tsx --test tests/surprise-script-policy.test.ts tests/surprise-one-shot.test.ts` and verify the new assertions fail.
- [x] Make raw validation require five complete logical clips, 18-21 Chinese characters per clip, exact subtitle/dialogue equality, exact continuous dialogue equality, and no repeated six-character phrase.
- [x] Remove deterministic fixed-dialogue repair after DeepSeek retries; return a clear generation error instead.
- [x] Run the focused tests and verify they pass.

### Task 2: Persist and resume script drafts

**Files:**
- Create: `supabase/functions/surprise-script-job/index.ts`
- Create: `src/api/surpriseScriptJob.ts`
- Modify: `src/components/marketing/SurpriseVideoDialog.tsx`
- Modify: `src/api/videoGeneration.ts`
- Modify: `supabase/functions/director-create-job/index.ts`

- [x] Verify the draft API contract and status mapping through the shared client, Edge Function code review, and TypeScript build.
- [x] Implement `start`, `poll`, `save`, and `discard` actions in `surprise-script-job` with user ownership checks.
- [x] Start `surprise-marketing-video` using `EdgeRuntime.waitUntil`, then persist the full pick result and `script_json`.
- [x] Make the dialog start or resume the draft when opened, poll while planning, debounce script saves, and discard before rerolling.
- [x] Pass `draft_job_id` to `director-create-job`; update that row, insert shots, mark it consumed, and start the existing pipeline.
- [x] Verify closing and reopening restores the same draft and starting video consumes it.

### Task 3: Freeze publish copy

**Files:**
- Create: `src/lib/videoAssetCopy.ts`
- Create: `tests/video-asset-copy.test.ts`
- Modify: `src/components/marketing/AssetDetailDialog.tsx`
- Modify: `supabase/functions/director-complete-job/index.ts`
- Modify: `supabase/functions/compose-callback/index.ts`

- [x] Add failing tests showing `video_copy` wins and `publish_copy` is deterministically mapped once.
- [x] Implement the copy resolver and use it whenever a video asset is opened.
- [x] Ensure complete/callback writes the canonical `video_copy` alongside `publish_copy`.
- [x] Remove the normal-state regenerate control; only show generation when no stored copy exists.
- [x] Verify repeated openings render identical text without an AI request.

### Task 4: Stream native downloads to the gallery

**Files:**
- Modify: `src/components/marketing/AssetDetailDialog.tsx`
- Modify: `src/lib/saveToGallery.ts`

- [x] Route all native video saves through `saveUrlToGallery` using a signed or mirrored long-term URL.
- [x] Keep the Web fallback and copy the canonical text only after a successful save.
- [x] Remove the native fallback that opens a browser window on failure; show a concrete permission/network error instead.
- [x] Run the TypeScript build.

### Task 5: Verify and publish

**Files:**
- Modify: `docs/superpowers/specs/2026-07-18-surprise-background-script-design.md`

- [x] Run focused Node tests.
- [x] Run `npm run build`.
- [x] Review `git diff --check` and the final diff.
- [ ] Commit all scoped changes and push `codex/fix-surprise-task-flow`.
- [ ] Provide one Chinese Lovable instruction listing the Edge Functions that must be deployed.

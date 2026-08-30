# Unified BOOMER Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the three visible AI creation entries and the separate director console with one persistent BOOMER video workflow that starts automatically, supports natural-language and direct script edits, supports changing reference images, and still preserves the one-click 15-second path.

**Architecture:** Keep `video_generation_jobs` as the single source of truth. Store the current script in `script_json`, selected references and BOOMER conversation in `source_pick_json`, and bounded script-version metadata in `meta`. The existing one-shot Seedance renderer remains the only new-task render path; old director routes and data stay readable but are hidden from normal navigation.

**Tech Stack:** React 18, TypeScript, Vite, Lovable Cloud/Supabase Edge Functions, Seedance one-shot rendering, Node test runner with `tsx`.

---

### Task 1: Lock the unified product contract in tests

**Files:**
- Create: `tests/unified-boomer-video.test.ts`
- Modify: `tests/surprise-script-dialog-state.test.ts`
- Test: `tests/unified-boomer-video.test.ts`

**Step 1: Write failing navigation assertions**

Assert that `MyMarketing.tsx` has one visible BOOMER video entry, does not render the AI image/copy/director cards, and uses the new subtitle.

**Step 2: Write failing workflow assertions**

Assert that the dialog exposes natural-language revision, reference-image selection, direct editing, and still invokes `renderSurpriseVideo` with 15 seconds, 9:16 and 1080p defaults.

**Step 3: Write failing persistence assertions**

Assert that `surprise-script-job` supports `revise` and `update_assets`, stores conversation/version metadata, validates store access, and restores the current task.

**Step 4: Run the focused tests**

Run: `npx --yes tsx --test tests/unified-boomer-video.test.ts tests/surprise-script-dialog-state.test.ts`

Expected: FAIL because the unified entry and actions do not exist yet.

**Step 5: Commit the red tests**

```bash
git add tests/unified-boomer-video.test.ts tests/surprise-script-dialog-state.test.ts
git commit -m "test: define unified BOOMER video workflow"
```

### Task 2: Consolidate the marketing home

**Files:**
- Modify: `src/pages/MyMarketing.tsx`
- Modify: `src/App.tsx`
- Test: `tests/unified-boomer-video.test.ts`

**Step 1: Remove visible AI image, AI copy and director cards**

Keep internal routes available for existing deep links and historical records, but remove their normal navigation entries.

**Step 2: Make BOOMER video the single creation entry**

Rename the page subtitle and card copy so staff understand: open once, script runs in the background, then edit by conversation or direct text, choose references if needed, and generate one 15-second video.

**Step 3: Keep asset library and publishing entries unchanged**

Do not disturb the current download, cover, copy or distribution paths.

**Step 4: Run focused test**

Run: `npx --yes tsx --test tests/unified-boomer-video.test.ts`

Expected: navigation assertions PASS; workflow assertions remain FAIL.

**Step 5: Commit**

```bash
git add src/pages/MyMarketing.tsx src/App.tsx
git commit -m "feat: make BOOMER video the single creation entry"
```

### Task 3: Add persistent script revision and reference updates

**Files:**
- Modify: `src/api/surpriseScriptJob.ts`
- Modify: `supabase/functions/surprise-script-job/index.ts`
- Create: `supabase/functions/_shared/surprise-script-revision.ts`
- Create: `tests/surprise-script-revision.test.ts`
- Test: `tests/unified-boomer-video.test.ts`

**Step 1: Write failing normalization tests**

Cover five beats, 18-21 Chinese characters per beat, 90-100 total characters, dialogue/subtitle equality, duplicate-phrase rejection, and preservation of the real storefront reference on beat one.

**Step 2: Implement the shared revision normalizer**

Convert user edits into the existing `SurpriseScript` shape, reuse the existing policy validator, and return a clear `adjustments` list instead of silently rejecting a nearly valid edit.

**Step 3: Add `revise` action**

Accept one natural-language instruction, call Lovable AI with current shop context, current script and selected-reference summaries, normalize/validate the result, append the user/assistant turn to a capped conversation array, and append a capped script version.

**Step 4: Add `update_assets` action**

Resolve selected URLs against the authorized shop's `marketing_assets`; require the real storefront asset as reference one; update `source_pick_json.picked_assets`, `surprise_result.assets`, the script reference manifest and first-beat binding.

**Step 5: Add client API wrappers**

Expose `reviseSurpriseScriptJob()` and `updateSurpriseScriptAssets()` with typed responses.

**Step 6: Run focused tests**

Run: `npx --yes tsx --test tests/surprise-script-revision.test.ts tests/unified-boomer-video.test.ts tests/surprise-script-policy.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/api/surpriseScriptJob.ts supabase/functions/surprise-script-job/index.ts supabase/functions/_shared/surprise-script-revision.ts tests/surprise-script-revision.test.ts tests/unified-boomer-video.test.ts
git commit -m "feat: persist BOOMER script revisions and references"
```

### Task 4: Build the unified BOOMER dialog

**Files:**
- Modify: `src/components/marketing/SurpriseVideoDialog.tsx`
- Create: `src/components/marketing/SurpriseScriptChat.tsx`
- Modify: `src/components/marketing/LibraryImagePickerDialog.tsx`
- Test: `tests/unified-boomer-video.test.ts`
- Test: `tests/video-delivery-and-script-edit.test.ts`

**Step 1: Add natural-language script editing**

Show a compact instruction box below the generated script. Submitting an instruction calls the persistent `revise` action and replaces the visible script with the validated server result. Closing and reopening restores the same conversation and script.

**Step 2: Keep direct editing**

Retain the existing five-beat editor. Autosave remains debounced, but rendering performs a final server save/normalization and uses the returned script.

**Step 3: Add reference image selection**

Open `LibraryImagePickerDialog` from the script screen. Preselect current references, preserve current selection order, require the current real storefront asset first, and update both the visible thumbnails and server task before rendering.

**Step 4: Change hard client blocking into actionable guidance**

Show density and subtitle issues beside the script, but let the final save endpoint normalize eligible edits. Block only missing beat/scene/action/dialogue or impossible storefront/reference conditions.

**Step 5: Preserve background task behavior**

Opening starts or restores the server task; closing never cancels it; generating a video consumes the script; `换个创意` explicitly discards it and creates a new task.

**Step 6: Run focused UI tests**

Run: `npx --yes tsx --test tests/unified-boomer-video.test.ts tests/surprise-one-shot-entry.test.ts tests/surprise-script-dialog-state.test.ts tests/video-delivery-and-script-edit.test.ts tests/surprise-task-state.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/components/marketing/SurpriseVideoDialog.tsx src/components/marketing/SurpriseScriptChat.tsx src/components/marketing/LibraryImagePickerDialog.tsx tests
git commit -m "feat: unify BOOMER video editing experience"
```

### Task 5: Align the one-shot renderer with edited task truth

**Files:**
- Modify: `supabase/functions/surprise-marketing-video/index.ts`
- Modify: `supabase/functions/_shared/surprise-one-shot.ts`
- Modify: `tests/surprise-one-shot.test.ts`
- Test: `tests/unified-boomer-video.test.ts`

**Step 1: Require selected task references and storefront ordering**

Reject references outside the authorized shop and ensure the real storefront is reference one. Never fall back to an AI-designed logo or entrance.

**Step 2: Recompile from the final edited script**

Clear cached beats/prompts after any edit, bind final reference indices, compile the one-shot prompt from exactly the visible dialogue/subtitles and current references, and keep one continuous high-density voice from approximately 0.2-14.5 seconds.

**Step 3: Preserve final delivery fields**

Keep cover generation, fixed publish copy and material-library insertion unchanged.

**Step 4: Run renderer tests**

Run: `npx --yes tsx --test tests/surprise-one-shot.test.ts tests/surprise-one-shot-entry.test.ts tests/video-delivery-and-script-edit.test.ts tests/unified-boomer-video.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add supabase/functions/surprise-marketing-video/index.ts supabase/functions/_shared/surprise-one-shot.ts tests
git commit -m "fix: render the final BOOMER script and references"
```

### Task 6: Full verification and release handoff

**Files:**
- Modify only files required by failures found in this step.

**Step 1: Run the full source test suite**

Run: `npx --yes tsx --test tests/*.test.ts`

Expected: PASS.

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS with no TypeScript/Vite build failure.

**Step 3: Run browser smoke test**

Verify `/me/marketing`: one creation entry, shop switcher preserved, script starts/restores, natural-language revision persists after reopen, manual edit persists, reference picker updates thumbnails, render submission remains one-shot 1080p.

**Step 4: Push branch**

```bash
git push -u origin codex/unified-boomer-video-design
```

**Step 5: Deploy only through configured project tooling**

Deploy the web build through the repository's supported release path. Deploy Lovable Cloud Edge Functions through the connected Lovable project tooling; do not use the public Supabase dashboard. Report separately what is code-complete, cloud-deployed and real-device-verified.


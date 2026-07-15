# Surprise Fast Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `惊喜一下` a one-click, script-faithful 15-second Seedance video while preserving Director multi-shot generation for the professional `AI 视频` entry.

**Architecture:** Keep the existing shop profile, marketing presets, knowledge-base retrieval, holiday and persona pipeline. Add a pure shared compiler that turns the validated five-part surprise script and ordered references into one Seedance timeline prompt; the UI submits through `surprise-marketing-video` in one-shot mode and no longer creates a Director job.

**Tech Stack:** React 18, TypeScript, Supabase Edge Functions, Volcengine Seedance 2.0, Node test runner, Vite.

---

### Task 1: Deterministic surprise prompt compiler

**Files:**
- Create: `supabase/functions/_shared/surprise-one-shot.ts`
- Create: `tests/surprise-one-shot.test.ts`

- [ ] Write tests proving the compiler emits five exact time ranges, every dialogue line, valid 1-based reference bindings, continuous-speech constraints, and no free-play instruction.
- [ ] Run `node --experimental-strip-types --test tests/surprise-one-shot.test.ts` and verify it fails because the module does not exist.
- [ ] Implement the pure reference-plan and prompt compiler.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Script generation source of truth

**Files:**
- Modify: `supabase/functions/generate-marketing-video-script/index.ts`
- Modify: `supabase/functions/surprise-marketing-video/index.ts`
- Test: `tests/surprise-one-shot.test.ts`

- [ ] Add tests for 48-58 character continuous dialogue and stable five-part normalization.
- [ ] Remove the viral-store-tour instruction that asks for a separate free-form `one_shot_prompt`.
- [ ] Store `surprise_mode`, `intent`, image descriptions, persona and reference manifest on the script returned to the client.
- [ ] Fix the old six-shot brief so it consistently requests one hook, three middle shots and one CTA.

### Task 3: Render with the same script and references

**Files:**
- Modify: `supabase/functions/render-marketing-video/index.ts`
- Test: `tests/surprise-one-shot.test.ts`

- [ ] Route only `script.surprise_mode` through the strict compiler.
- [ ] Preserve original image order so internal image index 0 always maps to Seedance `图片1`.
- [ ] Save prompt and reference manifest in the render payload for production diagnosis.
- [ ] Keep generic one-shot and professional per-shot behavior unchanged.

### Task 4: Employee-facing fast entry

**Files:**
- Modify: `src/components/marketing/SurpriseVideoDialog.tsx`
- Modify: `src/pages/MyMarketing.tsx`

- [ ] Replace `createVideoJob` with `surprise-marketing-video` submit mode.
- [ ] Remove model and resolution controls; fix Seedance Fast, 720p, 9:16 and 15 seconds.
- [ ] Add a prominent complete spoken-script card while keeping detailed shot cards and reference previews.
- [ ] Update progress copy to three employee-readable stages and keep retry/error actions.
- [ ] Keep `AI 视频` as the Director multi-shot entry.

### Task 5: Verification and delivery

**Files:**
- Modify: no production files unless verification reveals a defect.

- [ ] Run focused Node tests.
- [ ] Run `npm run build` and `npm run lint` for affected files.
- [ ] Run the local app and visually verify the marketing page and surprise dialog.
- [ ] Commit and push the branch, merge/push to `main`, deploy the Tencent frontend, and report the Lovable Edge Function sync command separately.


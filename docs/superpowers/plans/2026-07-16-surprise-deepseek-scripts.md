# Surprise DeepSeek Scripts Implementation Plan

> Execute test-first and keep all credentials in Supabase secrets.

**Goal:** Make the 15-second Surprise flow produce a validated 90–100 Chinese-character continuous script with five matching spoken beats, subtitles, balanced personas, and a Seedance prompt that preserves uninterrupted native dialogue.

**Architecture:** Keep `generate-marketing-video-script` as the orchestration edge function. Add a shared DeepSeek client and pure script-policy helpers. Normalize every result into one authoritative continuous dialogue plus five equivalent beats, then compile that exact structure into the Seedance one-shot prompt.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React, Node test runner, DeepSeek chat completions, Seedance rendering pipeline.

---

### Task 1: Lock the script contract with tests

**Files:**
- Modify: `tests/surprise-one-shot.test.ts`
- Create: `tests/surprise-script-policy.test.ts`

Add failing tests for 90–100 Chinese characters, five non-empty dialogues/subtitles, exact joined dialogue equality, timed Seedance dialogue anchors, balanced persona selection, and no automatic summer-vacation injection.

### Task 2: Implement pure normalization and policy helpers

**Files:**
- Modify: `supabase/functions/_shared/surprise-one-shot.ts`
- Modify: `supabase/functions/_shared/persona-generator.ts`
- Modify: `supabase/functions/_shared/holiday-context.ts`

Replace generic filler padding with deterministic five-beat normalization. Export testable persona selection helpers and make holiday context optional and age-compatible.

### Task 3: Add DeepSeek script generation

**Files:**
- Create: `supabase/functions/_shared/deepseek-client.ts`
- Create: `supabase/functions/_shared/surprise-script-policy.ts`
- Modify: `supabase/functions/generate-marketing-video-script/index.ts`

Use `DEEPSEEK_API_KEY` only for `viral_store_tour`. Request strict JSON, validate the result, perform up to two repair passes, and return a deterministic safe fallback if the provider output remains invalid.

### Task 4: Keep display and Seedance in sync

**Files:**
- Modify: `supabase/functions/_shared/surprise-one-shot.ts`
- Modify: `src/components/marketing/SurpriseVideoDialog.tsx`

Show each beat's spoken line and subtitle to the employee. Include the same lines as timed anchors in the Seedance prompt while retaining a single uninterrupted native voice track.

### Task 5: Verify and publish

Run focused tests, full build, lint on changed files where practical, scan the diff for secrets, commit, and push `codex/surprise-deepseek-scripts`.

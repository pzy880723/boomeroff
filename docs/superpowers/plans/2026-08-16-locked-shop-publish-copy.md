# Locked Shop Publish Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate lively video-specific publishing copy while appending immutable shop name, address, and business hours from the selected shop.

**Architecture:** Add a pure shared formatter used by both publishing-copy Edge Functions. The model generates only dynamic fields; the server sanitizes location/time claims, appends the locked shop block, persists the composed copy, and returns structured shop details.

**Tech Stack:** TypeScript, Supabase Edge Functions, Node test runner, React/Vite build.

---

### Task 1: Shared formatter

**Files:**
- Create: `supabase/functions/_shared/publish-copy-template.ts`
- Test: `tests/publish-copy-template.test.ts`

- [ ] Write tests for locked block formatting, hallucinated-detail removal, missing-shop behavior, and idempotent recomposition.
- [ ] Run the test and confirm it fails because the shared module does not exist.
- [ ] Implement `composeLockedPublishCopy` and `formatLockedShopBlock` with no database dependency.
- [ ] Run the focused test and confirm it passes.

### Task 2: Edge Function integration

**Files:**
- Modify: `supabase/functions/director-generate-publish-copy/index.ts`
- Modify: `supabase/functions/generate-marketing-video-copy/index.ts`

- [ ] Query `name,address,business_hours` from `shops` using the job or asset `shop_id`.
- [ ] Change model prompts so models return only dynamic content.
- [ ] Compose and persist the final copy with the shared formatter.
- [ ] Apply the formatter to cached old copy before returning it.

### Task 3: Database field and validation

**Files:**
- Create: `supabase/migrations/20260816143000_add_shop_business_hours.sql`
- Modify: `src/integrations/supabase/types.ts`

- [ ] Add `shops.business_hours` with the current standard default `每天 10:00–22:00`.
- [ ] Update generated local TypeScript table types.
- [ ] Run focused tests, existing marketing tests, and production build.

### Task 4: Release

- [ ] Commit and push GitHub `main`.
- [ ] Ask the connected Lovable project to apply the migration and deploy both Edge Functions.
- [ ] Build and sync `ai.boomeroff.com` to Tencent Cloud.
- [ ] Rebuild, install, and launch BOOMER GO on the connected iPhone.


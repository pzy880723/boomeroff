# BOOMER GO App Store Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce five polished 1320 x 2868 App Store preview images that position BOOMER GO as the operating system for headquarters, stores and franchisees.

**Architecture:** Build one local HTML render source with shared design tokens and five independent screenshot canvases. Each canvas uses product-accurate interface mockups derived from the current BOOMER GO UI, then Playwright captures each canvas at exact App Store dimensions.

**Tech Stack:** HTML/CSS, existing BOOMER GO image assets, Playwright screenshot capture, macOS `sips` for output validation.

---

### Task 1: Prepare the five-screen render source

**Files:**
- Modify: `docs/app-store/preview-source.html`
- Create: `docs/app-store/previews-v2/01-unified-operations-1320x2868.png`
- Create: `docs/app-store/previews-v2/02-ai-marketing-1320x2868.png`
- Create: `docs/app-store/previews-v2/03-product-recognition-1320x2868.png`
- Create: `docs/app-store/previews-v2/04-multi-store-collaboration-1320x2868.png`
- Create: `docs/app-store/previews-v2/05-omnichannel-publishing-1320x2868.png`

- [x] **Step 1: Replace the old three-card source with five independent canvases**

Use these exact canvas identifiers:

```html
<section class="store-shot" data-shot="01-unified-operations"></section>
<section class="store-shot" data-shot="02-ai-marketing"></section>
<section class="store-shot" data-shot="03-product-recognition"></section>
<section class="store-shot" data-shot="04-multi-store-collaboration"></section>
<section class="store-shot" data-shot="05-omnichannel-publishing"></section>
```

- [x] **Step 2: Apply the approved shared visual tokens**

```css
:root {
  --paper: #f3efe7;
  --paper-light: #fbf8f2;
  --ink: #161616;
  --muted: #6f6b65;
  --boomer-red: #e30613;
  --line: rgba(22, 22, 22, 0.12);
}
```

- [x] **Step 3: Build product-accurate interface surfaces**

Each screen must include one primary BOOMER GO surface and no unsupported feature claims:

```text
01 marketing home + current store selector
02 BOOMER video script + generated result
03 photo recognition + product story
04 store switcher + task and asset status
05 publish center + platform status
```

### Task 2: Render exact App Store images

**Files:**
- Create: `docs/app-store/render-previews.mjs`

- [x] **Step 1: Add a deterministic Playwright renderer**

```js
const shots = await page.locator('[data-shot]').all();
for (const shot of shots) {
  const name = await shot.getAttribute('data-shot');
  await shot.screenshot({
    path: `docs/app-store/previews-v2/${name}-1320x2868.png`,
  });
}
```

- [x] **Step 2: Render all five images**

Run:

```bash
node docs/app-store/render-previews.mjs
```

Expected: five PNG files under `docs/app-store/previews-v2`.

### Task 3: Validate visual and technical quality

**Files:**
- Verify: `docs/app-store/previews-v2/*.png`

- [x] **Step 1: Validate dimensions**

Run:

```bash
for file in docs/app-store/previews-v2/*.png; do sips -g pixelWidth -g pixelHeight "$file"; done
```

Expected: every file reports `1320` by `2868`.

- [x] **Step 2: Inspect the full set as a contact sheet**

Check title readability, logo accuracy, consistent device scale, no clipping, no fake store names and no repeated composition.

- [x] **Step 3: Run an automated content assertion**

Run:

```bash
rg -n "一套系统|一句话|拍一下|总部与门店|一键发到所有平台" docs/app-store/preview-source.html
```

Expected: all five approved title concepts are present.

### Task 4: Commit approved preview assets

**Files:**
- Modify: `docs/app-store/preview-source.html`
- Create: `docs/app-store/render-previews.mjs`
- Create: `docs/app-store/previews-v2/*.png`

- [ ] **Step 1: Review staged files**

Run:

```bash
git diff --check
git status --short
```

Expected: only App Store preview and release preparation files are changed.

- [ ] **Step 2: Commit the preview set**

```bash
git add docs/app-store
git commit -m "feat: prepare BOOMER GO App Store previews"
```

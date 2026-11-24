# BOOMER GO Learning And Card Authoring Implementation Plan

> **For agentic workers:** Use executing-plans: validate scope, then test, implement, and verify each boundary before release.

**Goal:** Implement the approved native learning tabs and administrator card generation on independent Tencent hosting without changing the live WeChat client.

**Architecture:** The existing Tencent operations API confirms ERP identity and delegates learning to a dedicated SQLite ledger. At the user's direction, the live learning library starts empty; no legacy reads, import or deletion are required. WeChat uploads a bounded reference image, polls for completion, and never publishes automatically.

**Tech Stack:** Native WXML/JS/WXSS, Python stdlib HTTP/SQLite, Pillow, existing ERP auth, DeepSeek chat completions.

- [x] Add failing HTTP tests for trusted permissions, scoped favorites, generation, persistence, and acknowledgement.
- [x] Implement learning routes, draft generation and refusal states, photo ownership, quiz scoring, and explicit save in the Tencent service.
- [x] Distinguish an intentional empty library from an unavailable legacy export; no import at cutover.
- [x] Implement approved native learning layout and card editor. Verify UI using an isolated DevTools session and real DeepSeek examples with no employee data.
- [x] Recheck the final client and server candidate, deploy only the Tencent backend and verify it, and leave the WeChat experience version intact.

Confirmed on Tencent: release `2026.11.25.1`, verified pre-cutover task/photo backup, empty learning ledger, configured direct DeepSeek and anonymous requests denied. The isolated WeChat DevTools flow verified both card types and employee training/test/favorite records. No real employee signed in for this verification, and no new WeChat version was uploaded.

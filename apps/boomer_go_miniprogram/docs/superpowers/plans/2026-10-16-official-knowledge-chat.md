# Official Knowledge Native Q&A

**Goal:** Migrate the existing Web knowledge-bound AI follow-up into the native official detail, retaining the same GO identity/RLS and no H5, invented facts, persisted conversation or grading mutation.

**Architecture:** One native collapsed card and page-local helper; API/transport reserve current scope once and never automatically resend this potentially paid action. Exact official UUID and source version bind every accepted reply. The fixed backend returns complete JSON only after final access/version checks. Scope changes invalidate callbacks before they can render or sign out a newer user.

**Tech Stack:** Existing WeChat WXML/WXSS/CommonJS, shared native lifecycle, Node VM tests, official compilers, existing GO Lovable Edge/provider. No new route, storage, database or dependency.

## Source, Design And Scope

Web KnowledgeChatPanel sends knowledgeId and messages to chat-knowledge from OfficialDetail. Existing generic spirit-chat is not equivalent. Original Web endpoint remains unchanged. R33 fixed2b017fa588d753bc44f087ac6c863213c6705722 was independently read/hashed: original11 isolated tests and20 extra boundaries passed, but a confirmed context-budget P2 blocked client release. Its12000 limit permitted37385 serialized context codepoints. Direct R34 umsg_01m51d94esen3adfq0rfgtb867 corrected this with demonstrated RED tests and final independent closure below. No real employee, source body, SMS or paid AI is used for verification.

Editable visual source: Figma SXY4nF6NWwrsw3jxZOIaDU frames25:2 (collapsed) and25:16 (open/error), same approved native red/white design, Noto Sans SC, at least44px primary targets. The expanded frame was actually rendered and inspected. Design text explicitly says synthetic; it is not a generated answer or runtime evidence. User authorized autonomous native migration; no extra product direction or tab is introduced.

## Fixed Wire Contract

Action official-knowledge-chat accepts only knowledge_id UUID and messages1..11. Messages strictly user/assistant alternate, first/last user, exactly role/content keys. Nonempty trimmed strings<=2000 Unicode codepoints each,<=10000 total; reject NUL, lone surrogates, extra keys or spoofed system/context. No automatically injected shop_id; a selected shop is not required for official knowledge, but fresh existing Auth/ERP still is.

Response exactly knowledge_id lowercaseUUID, reply nonempty valid Unicode<=4000 codepoints, source_updated_at, persisted:false. Accept only the loaded UUID and the same valid source timestamp. A changed source version requires fresh detail reading, not adoption of an unrelated answer. No conversation ID or database persistence is claimed.

R33 uses caller-JWT source reads and45s action-wide bounded waiting for DB/provider/final checks, same existing provider/model/secrets, no retries. Shared BFF Auth checks precede that timer, so do not claim45s from click. Transport uses65s, not the old20s. Final loss returns knowledge_chat_scope_changed, never an auto-renew/retry code. Other safe codes include not_found, db_unavailable, scope_unavailable, account_suspended, erp_scope_not_ready, ai_budget_exhausted, ai_rate_limited, ai_unavailable, ai_invalid_response and ai_timeout. No raw provider errors reach UI.

## Native Interaction

- Official detail only, collapsed by default, caption: temporary page conversation and AI reference. Native plain selectable text bubbles, question input, separate busy/error notice, send, show-earlier and confirmed new-conversation controls. No global article error/retry for chat failures.
- Store complete confirmed question/reply pairs privately in page RAM; render latest20 messages, explicitly reveal20 earlier at a time. A pending question is frozen separately; success atomically appends a pair. On failure retain the question and confirmed transcript; no automatic send/retry. Any repeat after an uncertain result explicitly warns it may consume quota again.
- No invented six-round cap. Each request chooses a contiguous recent tail of up to5 complete pairs within per-message and aggregate limits, plus the new question. Never cut a message or skip an invalid newest pair to include older content. If any prior pair is omitted, confirm the exact number of recent whole rounds being sent; all visible records remain. A too-long latest answer may require current-question-only confirmation. Cancel sends nothing and keeps the draft. No hidden truncation of displayed transcript.
- New conversation clears transcript/draft only after native confirmation bound to the current context and generation. Collapse hides only the panel; hide invalidates every in-flight callback and clears visible private data. On show, detail reload must verify the same identity/revision/UUID/source version before restoring page RAM. Unknown source version disables generation; do not manufacture a version. Unload/signout/identity or version change clears RAM.
- Bind actor/shop/scope/revision, detail request generation, UUID, source version, chat epoch, draft edit generation and frozen confirmation. Double clicks, old modal confirmations, late success/failure/401 cannot affect a new context. Preview is explicitly read-only and makes zero paid requests.

## Ownership And Verification Plan

- [x] Parent API/transport tests RED: no shop injection with/without store; reserve scope before first request; explicit invalid fields not masked; no403 or network automatic retry; stale scope blocks;65s action timeout and action-specific safe messages. Implement minimal exceptions without changing existing draft/assistant behavior.
- [x] Worker helper/detail tests RED: request/reply/version validation, strict Unicode/length, original transcript and recent contiguous window, explicit omission/retry/reset confirmations, local earlier paging, preview zero calls, double-click and lifecycle/identity/revision/version races including late401. Implement one helper and narrow detail JS/WXML/WXSS hooks, retaining all filter/quiz/OKR behavior.
- [x] Parent preview test RED: valid synthetic official detail exposes its stable updated_at; no fabricated AI answer or persistence. Add only source metadata necessary for the disabled preview card.
- [x] Independently read R34 final diff/hashes and rerun original backend tests plus old budget repro on repaired source; cap must hold on escaped serialized knowledge_data, including Unicode/escaping. Owner deployment reports and anonymous denial remain separate from real paid/employee acceptance.
- [x] Freeze worker paths; independent source review; full Mini tests,24-route/noH5 check and25WXML/26WXSS official compilers. Actual DevTools collapsed/open/input/disabled-preview states, existing detail filters and quiz regressions, plus screenshot evidence.
- [ ] Mini-only isolated index commit, non-force push/readback, archive clean extraction tests/check. Preserve Flutter checkout, normal index and phone state. Keep dedicated AppID/real employee/device/publication and other-role migration gaps explicit.

Parent owns API/transport/preview and their tests/docs/Git. Worker owns new shared/knowledge-chat.js, detail/index.js/wxml/wxss and focused tests. No shared page shell, unrelated source, backend, Git or live calls by the worker. R27 human approval remains untouched.

## R34 Closure Evidence

Final fixed ref2412d851859a95b733b0b1e8ee36e21f6b84dc71 is finished. R33-to-R34 diff only kchat.ts and its tests. Source hashes: kchat0e548f1946169b36731ab41b80442e30a71e8bfa4a9811c18c66407947db4762; tests810d434c57fcc7179b5e519134ae84eb324117aefc22d458c303ae91f25499b9; unchanged index14abc3691fc1bfa86cf1ebf796b03121ff24e061ce6183ba4efeca0b3bf554ee. Parent read the fixed diff/source and independently reran the saved raw-source hashes and Node-adapted13 original tests,20 late/deadline boundaries,81 budget combinations and old context repro. Knowledge JSON is now exactly<=12000 escaped codepoints; the original37385 example is12000. No unhandled rejection or real calls; normal4000-character body retained. The provider payload includes separately bounded history/system rules, not a false12000 total-request claim.

Independent reviewer also applied the new tests to the old R33 module:11 pass/2 expected failures. Lovable reports149 Deno, quiz5, typecheck and Edge deployment; parent Node adapters are not Deno/SQL/real provider proof. R33 code-before-tests was explicitly reported; only R34 has demonstrated RED regression evidence. Parent API21 RED→21 GREEN, combined51; preview version1 RED→GREEN plus unavailable check, combined24; both were independently rerun. No added RLS/grants, DB migration, old Web endpoint or Tencent changes.

## Native Verification

Worker36 RED→GREEN; real shared/page loading/local-reset regressions2 RED→GREEN, then2 existing handler regressions and preview input1 RED→GREEN:45 helper/page tests. Related112 passed. Independent45, API/preview75, regressions219 and full1389/1389 passed; parent fresh full1389/1389,24 routes, official25WXML/26WXSS passed. No new confirmed P1/P2.

Actual DevTools walked learning→official sample→detail→collapsed card→open→typed a Chinese source-related question→collapse/reopen with the same draft; send stayed disabled in preview. native-knowledge-chat-collapsed/open/input and deterministic phone crops are actual screenshots, not generated replies. No real AI call, unknown receipt, modal failure or paid generation was exercised in GUI; those branches use VM tests. Online unauthenticated official-knowledge-chat returned401 unauthorized, proving denial only, not deployed-byte equality, employee access or model answer quality.

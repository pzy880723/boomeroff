# BOOMER 帮我拍品类与批量改稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 BOOMER 帮我拍中加入生成前品类选择，并把自然语言改稿改为可收起、可持续沟通、最后一次性应用。

**Architecture:** `surprise-script-job` 增加只读恢复、对话记录、批量应用和清空对话动作，状态仍保存在现有 `source_pick_json` JSON 中。前端用独立品类配置和纯状态函数驱动选择页、脚本页与对话抽屉，真实生成继续复用现有 `surprise-marketing-video` 和 Seedance one-shot 链路。

**Tech Stack:** React 18, TypeScript, Supabase Edge Functions, node:test, Vite

---

### Task 1: 固定品类和页面状态契约

**Files:**
- Create: `src/lib/surpriseContentScope.ts`
- Modify: `src/lib/surpriseScriptView.ts`
- Test: `tests/surprise-script-dialog-state.test.ts`
- Test: `tests/surprise-content-scope.test.ts`

- [ ] 写失败测试，要求无任务时返回 `category` 页面，并校验五个前端品类键与后端一致。
- [ ] 运行 `node --test --experimental-strip-types tests/surprise-script-dialog-state.test.ts tests/surprise-content-scope.test.ts`，确认因 `category` 和前端配置缺失而失败。
- [ ] 实现最小品类配置和页面状态。
- [ ] 重跑测试确认通过。

### Task 2: 固定服务端恢复和批量对话契约

**Files:**
- Modify: `supabase/functions/_shared/surprise-script-revision.ts`
- Modify: `supabase/functions/surprise-script-job/index.ts`
- Test: `tests/surprise-script-revision.test.ts`
- Test: `tests/surprise-category-chat-contract.test.ts`

- [ ] 写失败测试，覆盖待应用要求追加、清空、合并以及 `current/chat/apply_conversation/clear_conversation` 四个动作。
- [ ] 运行对应 node tests，确认新契约尚未实现。
- [ ] 实现纯函数和 Edge Function 动作；`start` 保存并转发 `content_scope`。
- [ ] 重跑测试确认通过。

### Task 3: 接入前端 API 和交互

**Files:**
- Modify: `src/api/surpriseScriptJob.ts`
- Modify: `src/components/marketing/SurpriseScriptChat.tsx`
- Modify: `src/components/marketing/SurpriseVideoDialog.tsx`
- Test: `tests/surprise-category-chat-contract.test.ts`

- [ ] 先扩展契约测试，要求 API 包含恢复、聊天、批量应用和清空方法，且开始任务携带 `content_scope`。
- [ ] 运行测试确认失败。
- [ ] 实现品类选择页、默认折叠对话区、待应用计数和一次性应用按钮。
- [ ] 重跑测试确认通过。

### Task 4: 回归、视觉验证和发布

**Files:**
- Verify: `src/components/marketing/SurpriseVideoDialog.tsx`
- Verify: `supabase/functions/surprise-script-job/index.ts`
- Verify: `supabase/functions/surprise-marketing-video/index.ts`

- [ ] 运行所有 surprise 相关 node tests，预期全部通过。
- [ ] 运行 `npm run build`，预期构建成功。
- [ ] 在真实登录页面检查品类选择、恢复任务、折叠对话、连续聊天和一次性应用状态。
- [ ] 推送 GitHub `main`，部署 `surprise-script-job` 及共享依赖，发布前端。
- [ ] 线上再次检查任务能进入脚本和视频生成流程。

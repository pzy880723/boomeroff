# 实现计划

## 1. 数据库变更

### 新表：`app_settings`（全局键值配置，单行）

```sql
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- 所有登录用户可读（识别函数需要读取当前模型）
CREATE POLICY "Settings readable by authenticated"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
-- 仅 admin 可写
CREATE POLICY "Only admins can write settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

存储一个 key=`ai_model` 的行，value 形如：
```json
{
  "provider": "lovable" | "custom",
  "model": "google/gemini-2.5-flash-lite",
  "custom": { "baseUrl": "", "apiKey": "", "model": "" }
}
```
> 自定义 `apiKey` 写到此表（仅 admin 可读写）。RLS 已限制非 admin 看不到，前端读取时只暴露 `provider/model` 字段；识别函数用 service role 读全部。

### `product_knowledge` RLS 增加 admin update/delete 已存在 ✅

不需新建表。

## 2. 后台 — 知识库管理 Tab

修改 `src/pages/Portal.tsx`，把单 tab 扩成三个：「用户管理」「知识库」「AI 模型」。

新建 `src/components/admin/KnowledgeManager.tsx`：

- 顶部工具栏：品类下拉（带计数）+ 关键词搜索框 + 「新增」按钮 + 「批量删除 (N)」按钮
- 表格列：缩略图 / 品类（Badge）/ 名称 / 年代·产地 / 创建时间 / 操作（编辑、删除）
- 每行 checkbox，表头全选；批量删除前 AlertDialog 确认
- 分页：每页 20 条，上下页按钮
- 编辑 / 新增使用同一个 `KnowledgeEditDialog`（新建 `src/components/admin/KnowledgeEditDialog.tsx`）：表单含 名称、品类、年代、产地、卖点（多行/数组编辑）、贴士、图片 URL；保存调用 update 或 insert
- 操作权限：anchor 进入只读（按钮 disabled + 提示）；admin 全功能

## 3. 后台 — AI 模型设置 Tab

新建 `src/components/admin/AISettingsPanel.tsx`：

- 单选「使用 Lovable AI」/「使用自定义 OpenAI 兼容接口」
- Lovable AI 模式：型号下拉（gemini-2.5-flash-lite / flash / pro / gpt-5-mini / gpt-5-nano / gemini-3-flash-preview），并标注「速度/质量」标签
- 自定义模式：三个输入框 — Base URL（如 `https://ark.cn-beijing.volces.com/api/v3` 或 `https://api.deepseek.com/v1`）、API Key（password 框）、Model 名称
- 「测试连接」按钮：调用新增的边缘函数 `test-ai-model` 用一张极小测试图打一次，返回 ok/失败
- 「保存」写入 `app_settings.ai_model` 行
- 顶部展示当前生效配置；保存成功 Toast「设置已保存，下一次识别即生效」

## 4. 边缘函数 `recognize-product` 改造

每次调用前读取 `app_settings.ai_model`：

- `provider === 'lovable'`：保持现有 `https://ai.gateway.lovable.dev/v1/chat/completions` + `LOVABLE_API_KEY`，只替换 `model` 字段
- `provider === 'custom'`：用 `value.custom.baseUrl + '/chat/completions'` + `Authorization: Bearer <apiKey>` + `model: value.custom.model`，请求体保持 OpenAI Chat Completions 兼容格式（已是）
- 缺省 / 未配置 → 回退默认 `google/gemini-2.5-flash-lite` + Lovable
- 失败时把 provider 标识写入错误信息，便于调试

新建边缘函数 `test-ai-model`：接收 `{provider, model, baseUrl?, apiKey?}`，发一条最小请求（"hi" 文本），返回 `{ok:true}` 或 `{ok:false, error:"..."}`，仅 admin 可调。

## 5. 文件清单

- 迁移：新建 `app_settings` 表 + RLS
- 编辑：`src/pages/Portal.tsx`（加 tabs）
- 新建：
  - `src/components/admin/KnowledgeManager.tsx`
  - `src/components/admin/KnowledgeEditDialog.tsx`
  - `src/components/admin/AISettingsPanel.tsx`
- 编辑：`supabase/functions/recognize-product/index.ts`（按 settings 路由 provider）
- 新建：`supabase/functions/test-ai-model/index.ts`
- 更新：`mem://index.md` + 新增两条 memory

## 技术细节

**安全说明**：自定义 API Key 存到数据库 `app_settings` 表，RLS 限制只有 admin 角色可读；客户端 `AISettingsPanel` 读取时会拿到全部字段（包括 key），但因 RLS 不在 admin 角色的话查询会失败。建议密码框默认显示为 `••••••`（已存在时不回填明文，留 placeholder「已配置，留空则不修改」）。

**速度承诺**：默认型号仍为 flash-lite，自定义型号速度由用户自负责，UI 上文字提示「flash-lite 最快，1-2 秒；其他型号可能 3-5 秒」。

**布局**：

```text
[Portal Header]
[Tabs: 用户管理 | 知识库 | AI 模型]
  └ 知识库
     [品类▼] [搜索] [新增] [批量删除]
     ┌─┬───┬────────┬────────┬────────┬────┐
     │☑│图│ 名称   │ 品类   │ 年代   │操作│
     └─┴───┴────────┴────────┴────────┴────┘
  └ AI 模型
     [○ Lovable AI] [○ 自定义]
     ...表单...
     [测试连接] [保存]
```
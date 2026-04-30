## 两个修复

### 1. 删除卡片上的「移除」按钮
`src/pages/MyLibrary.tsx`：列表卡片底部只保留商品名，移除按钮只在详情弹窗里保留（已经有了）。

### 2. 修复"已加入但官方库找不到"

**根因**（已通过数据库核实）：
- 用户 admin 身份正确
- `product_knowledge` 里有这条记录但 `is_official=false`
- `official_knowledge` 中没有对应 `source_product_id` 的记录

→ 这条 product_knowledge 是**旧版本**插入的（旧逻辑没有 admin 同步到 official 的步骤）。
新版本进入页面时，`useEffect` 检查 `product_knowledge` 已存在，立即 `setKnowledgeAdded(true)`，按钮 disable，admin 永远没机会触发新逻辑。

**还有一个潜在 bug**：`addToKnowledge` 把 `capturedImage`（base64 dataURL）写进 `official_knowledge.cover_url` 和 `gallery`，体积巨大会写入失败/无法显示。

#### 修复 LiveStreamPanel.tsx

**(a) useEffect 同步状态时，admin 必须额外检查 official_knowledge 是否存在**：
```ts
// admin 视角：只有 product_knowledge 和 official_knowledge 都存在时才算"已收录"
const officialOk = isAdmin
  ? !!(await supabase.from('official_knowledge').select('id')
        .eq('source_product_id', currentProductId).limit(1).maybeSingle()).data
  : true;
setKnowledgeAdded(!!pk && officialOk);
```

**(b) addToKnowledge 改成幂等"补齐"逻辑**：
- 不再因为 product_knowledge 已存在就早返回
- 改为：缺啥补啥
  - 没有 product_knowledge → insert
  - admin 且没有 official_knowledge → insert
  - 都有 → 提示已收录

**(c) cover_url/gallery 用真实上传 URL**：
insert official_knowledge 前先查 `products.image_url`，用它而不是 `capturedImage`。

**(d) 旧数据自动修复**：
admin 触发时若发现 product_knowledge 已存在但 official 缺失 → 直接补建 official_knowledge 并把 product_knowledge.is_official 更新为 true。

## 涉及文件
- `src/pages/MyLibrary.tsx`：删除卡片上的移除按钮（约 -10 行）
- `src/components/dashboard/LiveStreamPanel.tsx`：
  - useEffect 增加 admin 的 official 检查
  - addToKnowledge 改为幂等补齐 + 用 products.image_url

## 验收
1. 个人知识库列表卡片底部不再有「移除」按钮（详情弹窗内仍有）
2. admin 现在重新点「直接收录为官方知识」可成功补建 official_knowledge 记录
3. 在「官方知识库」页面能看到刚收录的商品，且封面图正常显示

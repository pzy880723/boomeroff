## 现状（识别完成后两个按钮）

| 按钮 | 写入 | 谁可见 | 可取消 |
|---|---|---|---|
| 加入知识库（金色主按钮） | `product_knowledge` | 全团队 | 否 |
| 收藏到个人知识库（灰色） | `user_favorites` | 仅本人 | 是 |

## 问题
1. **图标相同、文案相近**，店员无法区分「团队池」与「我的收藏」
2. 「加入知识库」**无去重**：刷新后 `knowledgeAdded` 重置，可重复插入
3. **进入页面时不查重**，重复加无任何提示
4. `product_knowledge` 几乎等同 `products` 表副本，沉淀价值不明确
5. 店员真实诉求：①收藏给自己；②建议升级为官方/给团队学习

## 改进方案

### A. 文案与视觉重设计
- 主按钮 → **「申请收录到官方知识库」**（金色，admin 直接收录，anchor 进入待审）
  - 图标改为 `Library` 或 `Award`
- 次按钮 → **「⭐ 收藏到我的学习清单」**（灰色，可取消）
  - 图标用 `Star` 或 `Heart`，与「我的」页保持一致

### B. 「加入知识库」逻辑优化（`LiveStreamPanel.tsx`）
1. 进入 displayResult 时，先查 `product_knowledge.product_id == currentProductId AND created_by == user.id`，初始化 `knowledgeAdded`
2. insert 前再 select 一次防并发重复
3. 失败时区分错误码：42501 → toast「需要主播或管理员权限」
4. 对 admin 用户：成功后自动同步到 `official_knowledge`（已有 KnowledgeManager「一键提升」逻辑可复用）；按钮文案在 admin 下显示「直接收录为官方」

### C. 字段补全
`product_knowledge` insert 时同时写入 `material/craft/dimensions/condition/description`（来自 `displayResult`），让团队池真正承载知识。

### D. 状态持久化
- 把「加入知识库」与「收藏」的初始状态都改为 useEffect 中查询数据库后再设置，不再依赖纯 local state。
- 进入同一 currentProductId 时立刻反映正确状态，不会出现"刷新后又能再加一次"的 bug。

### E. 店员引导
在两个按钮上方加一行 11px 灰色提示：
> 收藏只有自己看得到 · 申请收录会让所有同事都能学到

## 不改的部分
- RLS 策略不动
- 表结构不动（product_knowledge 已有 is_official 字段够用）
- /portal 的 KnowledgeManager「一键提升」逻辑保留作为 admin 终审入口

## 验收
- 识别后两个按钮文案/图标/颜色清晰区分
- 重复点击「申请收录」无重复入库；admin 直接进 official，anchor 进入团队池
- 收藏可正常取消，进入已识别商品后状态正确还原
- anchor 看到的主按钮文案是「申请收录到官方」，admin 看到的是「直接收录为官方」

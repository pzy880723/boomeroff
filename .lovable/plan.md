# 识别准确率提升方案

## 问题根因（一句话总结每个）

1. **默认模型太弱**：`gemini-2.5-flash-lite` 是家族里最弱的视觉模型，瓷器细节根本看不清。
2. **图片压缩过度**：640px + 质量 0.6，底款/釉色/开片细节全糊。
3. **缓存机制反向污染**：用 AI 生成的中文关键词模糊匹配历史 `products`，错一次错一片。
4. **Prompt 缺领域知识**：没教模型瓷器怎么断代/识窑口，也没强制"不确定就写不详"。
5. **官方知识库未参与识别**：`official_knowledge` 完全没作为先验提示。

---

## 改造内容

### 1. 升级默认模型 + 分级策略
- **单图模式**默认改为 `google/gemini-2.5-flash`（平衡速度+精度，瓷器细节能看清）。
- **多角度模式**（用户已经愿意等）默认升到 `google/gemini-2.5-pro`（顶级视觉推理，最适合鉴定）。
- 后台 `/portal` 的 AI 设置面板新增"识别精度"选项：极速 (lite) / 标准 (flash) / 高精度 (pro)，默认标准。
- 速度影响：单图 flash 比 lite 慢约 0.5-1 秒，但准确率显著提升；可接受。

### 2. 提高图片质量
- 单图模式：压缩参数从 `640px / 0.6` 改为 `1280px / 0.85`（瓷器底款细节关键）。
- 多角度模式：`1024px / 0.8`（多张要控制总传输量）。
- 在 `LiveStreamPanel.tsx` 的 `compressImage` 和 `grabFrame` 都改。
- 摄像头流分辨率保持 1920×1080（已是这个值）。

### 3. 关掉"反向污染"的关键词缓存
- 移除 `recognize-product` 里基于 `image_hash` 关键词模糊匹配 `products` 表的逻辑（lines 208-243）。
- 这个"缓存"省的钱远小于错误识别带来的损失。
- 真正的知识复用走第 5 步的 RAG 路径。

### 4. 重写 Prompt（领域专家版）
新 prompt 关键改动：
- 明确身份："你是日本中古杂货鉴定师，尤其擅长瓷器（有田/伊万里/九谷/京烧/景德镇）、漆器、铜器、香道具、动漫周边"。
- 加入"鉴定线索清单"：瓷器看圈足/底款/釉色/开片/器型；漆器看莳绘工艺/胎体；铜器看铜色/铸造工艺/铭文。
- **强制"不确定原则"**：置信度 <0.6 的字段一律写"不详"，宁可少说也不瞎编。`name` 字段如果只能确定大类，就只写大类（如"青花瓷碗"而不是编一个"清乾隆青花缠枝莲纹碗"）。
- 新增 `confidence` 字段（0-1），让模型自评。前端 <0.7 时在 UI 标灰提示"识别置信度较低，建议补拍"。
- 移除 `imageHash` 字段（不再需要）。

### 5. 知识库 RAG（用 official_knowledge 做先验）
- 识别前：从 `official_knowledge` 拉取最近/热门的 20-30 条精简记录（name + category + era + origin + 简短特征），作为"参考库"塞进 system prompt。
- 模型识别时优先匹配参考库中的已有商品；若高度相似就复用其字段。
- 这样**官方收录得越多，识别越准** —— 形成正向飞轮，替代被移除的反向缓存。
- 当前 `official_knowledge` 只有 2 条，建议管理员后续多收录；少于 5 条时跳过 RAG，避免空注入。

### 6. UI 微调
- 结果卡片显示置信度徽章：≥0.8 绿色"高置信"，0.6-0.8 黄色"中等"，<0.6 红色"建议补拍"。
- 多角度模式按钮文案改为"多角度精拍（更准）"，引导用户在重要商品上选多角度。

---

## 技术细节

**文件改动**：
- `supabase/functions/recognize-product/index.ts`：换 prompt、删缓存逻辑、加 RAG 注入、根据 `images.length` 选模型。
- `src/components/dashboard/LiveStreamPanel.tsx`：`compressImage` / `grabFrame` 提高分辨率和质量。
- `src/components/recognition/CameraCapture.tsx`：同步压缩参数。
- `src/components/recognition/ProductDetailCard.tsx`：加置信度徽章。
- `src/types/index.ts`：`RecognitionResult.confidence` 已存在，无需改。
- `src/components/admin/AISettingsPanel.tsx`：加"识别精度"下拉。

**模型选择伪代码**：
```text
const presetMode = settings.precision || 'standard'  // economy | standard | high
const modelMap = {
  economy:  'google/gemini-2.5-flash-lite',
  standard: 'google/gemini-2.5-flash',
  high:     'google/gemini-2.5-pro',
}
// 多角度自动升一档（除非用户选了 high）
const model = images.length > 1 && presetMode === 'standard'
  ? modelMap.high : modelMap[presetMode]
```

**RAG 注入示例**：
```text
【已收录的官方知识（识别时优先匹配）】
- 有田烧青花花鸟纹碗 | 瓷器 | 江户后期 | 日本佐贺
- 九谷烧赤绘人物盘 | 瓷器 | 明治时期 | 日本石川
... (最多 30 条)
若眼前商品与上述某条高度相似，请直接沿用其名称/年代/产地。
```

**性能影响估算**：
- 单图 lite → flash：约 +0.8 秒（从 ~1.5s → ~2.3s），仍在 1-3 秒目标内。
- 多图 pro：约 3-5 秒，符合"愿意等更准"的预期。
- RAG 注入增加约 500-800 tokens，延迟影响 <0.2 秒。

**不破坏的东西**：
- 数据库 schema 不动（`image_hash` 字段保留但不再写入新数据）。
- 自动发到中古圈、自动入 `products`、收藏、加入知识库等流程全部保留。
- 自定义 OpenAI 接口配置仍然可用。

---

## 预期效果

- 瓷器识别准确率显著提升（从经常乱编 → 能正确识别窑口大类，不确定时坦然写"不详"）。
- 杜绝"一个错的把后面带歪一片"的缓存污染。
- 官方知识库变成正向资产 —— 录入越多越聪明。
- 速度从 1-2 秒变 2-3 秒，仍在可接受范围。

确认方案后我开始实现。

## 目标
在「官方知识库」的**「全部」类目**下，提供 3 种排序方式切换：**热度 / 重要程度 / 最新更新**。

- 热度 = 收藏数 + 浏览数（综合分）
- 重要程度 = 基于互联网搜索热度的预计算分数（不能每次实时联网）
- 最新更新 = 现有的 `updated_at`/`created_at` 倒序

## 一、Schema 改动（migration）

`official_knowledge` 表新增 3 列（默认 0，可空）：

```sql
ALTER TABLE official_knowledge
  ADD COLUMN view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN favorite_count integer NOT NULL DEFAULT 0,
  ADD COLUMN importance_score integer NOT NULL DEFAULT 0;

CREATE INDEX idx_ok_hotness ON official_knowledge ((favorite_count*3 + view_count));
CREATE INDEX idx_ok_importance ON official_knowledge (importance_score DESC);
```

为 `view_count` 创建 RPC，让前端打开详情时安全自增（绕过 admin-only UPDATE 策略）：

```sql
CREATE OR REPLACE FUNCTION public.increment_official_view(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE official_knowledge SET view_count = view_count + 1 WHERE id = _id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_official_view(uuid) TO authenticated;
```

为 `favorite_count` 加触发器，自动随 `user_favorites` 中 `source_type='official'` 的增删同步：

```sql
CREATE FUNCTION public.sync_official_favorite_count() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.source_type='official' THEN
    UPDATE official_knowledge SET favorite_count = favorite_count + 1 WHERE id = NEW.source_id;
  ELSIF TG_OP='DELETE' AND OLD.source_type='official' THEN
    UPDATE official_knowledge SET favorite_count = GREATEST(favorite_count-1,0) WHERE id = OLD.source_id;
  END IF;
  RETURN NULL;
END;$$;

CREATE TRIGGER trg_sync_official_fav
AFTER INSERT OR DELETE ON user_favorites
FOR EACH ROW EXECUTE FUNCTION sync_official_favorite_count();
```

历史回填一次：把当前 `user_favorites` 数量同步到 `favorite_count`。

## 二、importance_score 预计算（edge function）

新建 edge function `compute-importance`：

- 仅 admin 可调用（验证 JWT + has_role）。
- 遍历 `official_knowledge` 中 `importance_score=0` 或 `updated_at` 7 天前的条目，对每条用 **Perplexity API**（`sonar` 模型，已是连接器选项）查询 `"<name> <ip_name> 中古"` 的搜索结果数/热度。
- 把返回的引用数（`citations.length`）+ 关键词权重（如 "限定/绝版/经典" 出现 +2）映射到 0–100 的整数，写回 `importance_score`。
- 在 `/portal` 后台 KnowledgeManager 顶部加一个「重新计算热度指数」按钮触发该函数；带进度提示。
- 由于成本/速率原因，每次只处理 50 条，前端循环触发直到全部完成。

如果 Perplexity 未连接，按钮提示「请先在 Connectors 中连接 Perplexity」。整体可降级为手动在管理后台填值（KnowledgeManager 的编辑表单加一个 0–100 的数字输入框）。

## 三、前端改动（`src/pages/OfficialLibrary.tsx`）

1. 新增排序状态（仅 `cat==='all'` 时显示 UI）：
   ```ts
   type SortKey = 'latest' | 'hot' | 'important';
   const [sort, setSort] = useState<SortKey>('latest');
   ```
2. 在搜索框下方、主类目网格上方插入一行 segmented control（只在 `cat==='all'` 时渲染）：
   ```tsx
   <div className="flex gap-1 rounded-md bg-muted p-1">
     <SortBtn k="latest" label="最新更新" icon={Clock} />
     <SortBtn k="hot"     label="最热"   icon={Flame} />
     <SortBtn k="important" label="重要"  icon={Star} />
   </div>
   ```
3. 查询逻辑根据 sort 切换 order：
   - `latest` → `.order('updated_at', { ascending: false })`
   - `hot`    → 通过 RPC 或在前端按 `favorite_count*3 + view_count` 降序；最简单：select 全部字段后，前端用 `useMemo` 排序。或新建一个 db view `official_knowledge_with_hotness`，但前端排序更轻量，items 已限 120 条。
   - `important` → `.order('importance_score', { ascending: false })`
4. 切换一级类目时排序 UI 隐藏，自动回到 `latest` 行为（但 state 保留，回到全部时复用上次选择）。
5. 详情打开时调用 `supabase.rpc('increment_official_view', { _id: detail.id })`（fire-and-forget）。

## 四、后台管理改动（`src/components/admin/OfficialKnowledgeManager.tsx`）

- 编辑表单新增 `importance_score`（0–100 数字输入），允许 admin 手动覆写。
- 顶部加按钮「重新计算重要程度」→ 调用 `compute-importance` edge function。

## 五、TypeScript 类型
`OfficialItem` 增加 `view_count`、`favorite_count`、`importance_score`。

## 验收
- 在「全部」类目下出现 3 个排序切换，切换后列表重排无闪烁。
- 切到任何具体一级类目，排序切换隐藏。
- 打开详情后再次回到列表，浏览数已增加。
- 收藏/取消收藏后该条目热度立刻变化。
- 后台点击「重新计算重要程度」可回填 importance_score；无 Perplexity 时给出明确提示。

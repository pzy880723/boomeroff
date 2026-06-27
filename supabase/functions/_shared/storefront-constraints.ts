// 强制门店物理形态约束:BOOMER·OFF 位于商场 B1 层,
// 是一个 8 米宽的开放式店面(无门),顾客从商场走廊直接走入。
// 用于注入脚本 Prompt 和 Seedance 渲染 Prompt,避免出现街边/推门等不合理镜头。

export const STOREFRONT_CONSTRAINT_ZH = `【门店物理形态(硬约束 · 不可违反)】
- 本店位于【商场 B1 层室内】,不是临街店铺,周围是商场走廊、中庭、对面商铺;不能出现马路、街边、人行道、车水马龙、户外天空、夜景街景。
- 本店是【8 米宽的开放式店面,完全没有门】:没有玻璃门、没有推拉门、没有门框、没有门把手、没有门帘、没有卷帘门。
- 顾客/博主进店的方式只有一种:从商场走廊正面或侧面【直接走进开放式店面】,无需推门、拉门、开门动作。
- 招牌/Logo 在开放式店面的上方门楣或顶部灯箱上,不是挂在街面。
- 所有提到"进店""走进店里"的场景与动作描述,都必须基于以上设定。禁止出现"推门进店""拉开店门""门一开""门口的玻璃门"等表述。`;

export const STOREFRONT_CONSTRAINT_EN = `STORE PHYSICAL CONSTRAINT (HARD RULE, must obey): The shop is located INSIDE a shopping mall on B1 underground floor. It is an open-front 8-meter-wide storefront with NO door, NO doorway frame, NO glass door, NO door handle, NO door curtain, NO roll-up shutter. The talent enters by walking directly from the mall corridor into the open shopfront — no pushing, no pulling, no opening any door. Background must show mall corridor / mall atrium / opposite mall shops / mall ceiling lighting. NEGATIVE — strictly forbid: street, sidewalk, road, traffic, car, outdoor sky, night street, push door, pull door, open door, door handle, door curtain, glass door, shutter, store entrance with door.`;

export const STOREFRONT_OPENING_EN = `Opening shot (0-2s): camera POV from inside the mall corridor looking toward the open-front shop, the brand logo / signage on the lintel above the open frontage is visible, the visiting influencer walks straight in from the corridor side into the open shopfront (NO door, NO pushing). From shot #2 the camera is already inside the shop interior with retail shelves around.`;

export const STOREFRONT_OPENING_ZH = `【强制开场(第 1 镜 / 0–2s · 不可改)】镜头从商场走廊视角看向开放式店面,顶部门楣上的 logo/店招清晰可见,探店博主从走廊侧自然走入开放式店面(无门、不要推门、不要拉门);从第 2 镜起镜头已在店内货架间。`;

// 软清洗:把脚本里漏网的"推门 / 街边 / 马路"类描述替换成合理表述,作为兜底。
export function sanitizeStorefrontText(s: string): string {
  if (!s) return s;
  return s
    .replace(/推开?门(进店|进去|而入)?/g, '走进店里')
    .replace(/拉开?门/g, '走进店里')
    .replace(/打开店?门/g, '走进店里')
    .replace(/门把手/g, '门楣 logo')
    .replace(/玻璃门/g, '开放式店面')
    .replace(/(店|大)?门一开/g, '走进店里时')
    .replace(/卷帘门/g, '开放式店面')
    .replace(/门帘/g, '开放式店面')
    .replace(/(走在|走到|来到)?(马路|街边|街口|街上|路边|人行道)/g, '走在商场走廊')
    .replace(/(临街|街铺|沿街)/g, '商场内');
}

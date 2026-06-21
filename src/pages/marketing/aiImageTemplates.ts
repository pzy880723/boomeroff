// 前端模板元数据。prompt 模板放后端,前端只展示分类/字段表单。
export type TemplateField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type AiImageTemplate = {
  id: string;
  name: string;
  desc: string;
  fields: TemplateField[];
  /** 需要的参考图数量提示(0=可选,1=建议带商品图) */
  refsHint: 0 | 1;
  defaultAspect: '1:1' | '3:4' | '9:16' | '16:9';
};

export type TemplateGroup = {
  key: string;
  name: string;
  templates: AiImageTemplate[];
};

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    key: 'product',
    name: '商品海报',
    templates: [
      {
        id: 'product-vintage-film',
        name: '中古胶片质感',
        desc: '米色背景 · 自然光 · 复古',
        refsHint: 1,
        defaultAspect: '3:4',
        fields: [
          { key: 'name', label: '商品名', placeholder: '如:80s 复古马克杯' },
          { key: 'price', label: '价格(可空)', placeholder: '如:128' },
          { key: 'point', label: '一句话卖点(可空)', placeholder: '如:厚壁手感 · 完好品相' },
        ],
      },
      {
        id: 'product-natural-light',
        name: '日杂自然光',
        desc: '浅木色 · 侧逆光 · 像杂志内页',
        refsHint: 1,
        defaultAspect: '3:4',
        fields: [
          { key: 'name', label: '商品名', placeholder: '如:亚麻方巾' },
          { key: 'price', label: '价格(可空)', placeholder: '' },
          { key: 'point', label: '一句话卖点(可空)', placeholder: '' },
        ],
      },
      {
        id: 'product-minimal-white',
        name: '极简白底',
        desc: '纯白背景 · 大字价格 · MUJI 感',
        refsHint: 1,
        defaultAspect: '1:1',
        fields: [
          { key: 'name', label: '商品名', placeholder: '' },
          { key: 'price', label: '价格', placeholder: '如:89' },
          { key: 'point', label: '一句话卖点(可空)', placeholder: '' },
        ],
      },
    ],
  },
  {
    key: 'promo',
    name: '活动海报',
    templates: [
      {
        id: 'promo-weekend-sale',
        name: '周末特卖',
        desc: '暖色 · 折扣徽章',
        refsHint: 1,
        defaultAspect: '3:4',
        fields: [
          { key: 'subtitle', label: '副标题(可空)', placeholder: '如:精选 30 件,低至 5 折' },
          { key: 'discount', label: '折扣文字(可空)', placeholder: '如:全场 7 折' },
          { key: 'dates', label: '时间(可空)', placeholder: '如:6.21 - 6.22' },
        ],
      },
      {
        id: 'promo-new-arrival',
        name: '新到货 NEW IN',
        desc: '干净 · 精品店上新感',
        refsHint: 1,
        defaultAspect: '3:4',
        fields: [
          { key: 'subtitle', label: '副标题(可空)', placeholder: '如:日本直邮中古杯具一批' },
          { key: 'dates', label: '时间(可空)', placeholder: '如:本周六上架' },
        ],
      },
      {
        id: 'promo-clearance',
        name: '清仓最后三天',
        desc: '紧迫感 · 中古调性',
        refsHint: 1,
        defaultAspect: '3:4',
        fields: [
          { key: 'discount', label: '折扣文字(可空)', placeholder: '如:全场 5 折起' },
          { key: 'subtitle', label: '副标题(可空)', placeholder: '' },
        ],
      },
    ],
  },
  {
    key: 'cover',
    name: '朋友圈封面',
    templates: [
      {
        id: 'cover-weekly-pick',
        name: '本周精选 9 宫格',
        desc: '克制 · 拼贴感',
        refsHint: 1,
        defaultAspect: '9:16',
        fields: [
          { key: 'subtitle', label: '副标题(可空)', placeholder: '如:第 23 期' },
        ],
      },
      {
        id: 'cover-hero-product',
        name: '单品大字报',
        desc: '主角 · 大字 · 一眼吸引',
        refsHint: 1,
        defaultAspect: '9:16',
        fields: [
          { key: 'title', label: '大字标题', placeholder: '如:本期主角' },
          { key: 'subtitle', label: '副标题(可空)', placeholder: '' },
        ],
      },
      {
        id: 'cover-store-vibe',
        name: '店内氛围',
        desc: '温暖光 · 生活气',
        refsHint: 1,
        defaultAspect: '9:16',
        fields: [
          { key: 'title', label: '大字标题(可空)', placeholder: '如:走进来坐坐' },
          { key: 'subtitle', label: '副标题(可空)', placeholder: '' },
        ],
      },
    ],
  },
];

export function findTemplate(id: string): AiImageTemplate | undefined {
  for (const g of TEMPLATE_GROUPS) {
    const t = g.templates.find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}

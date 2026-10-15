function text(value) {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function record(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch (_) { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return values.filter((value, index) => value && values.indexOf(value) === index); }
function media(value) { return /^https:\/\/[^\s/@]+\//i.test(text(value)) ? text(value) : ''; }

// Project only known business fields. Raw source metadata and quiz material stay out of view data.
function businessContent(value) {
  const raw = record(value);
  const analysis = record(raw.ai_analysis);
  const legacy = record(analysis.result);
  const content = record(raw.content);
  const cards = [raw.card, content.card, content, analysis.card, analysis.enriched, legacy.card, legacy.enriched].map(record);
  const fields = [];
  const sections = [];
  const addField = (label, value) => { if (text(value)) fields.push({ label, value: text(value) }); };
  const addSection = (title, values) => {
    const entries = values.filter((entry) => entry.body || entry.title).filter((entry, index, list) => (
      list.findIndex((other) => other.title === entry.title && other.body === entry.body) === index
    ));
    if (entries.length) sections.push({ title, entries });
  };
  const scalar = (key) => text(raw[key]) || text(analysis[key]) || text(legacy[key]);
  for (const [key, label] of [['material', '材质'], ['craft', '工艺'], ['era', '年代'], ['origin', '产地'], ['dimensions', '尺寸'], ['condition', '品相'], ['ip_name', '系列 / IP']]) addField(label, scalar(key));
  addField('读音', unique(cards.map((card) => text(card.pronunciation))).join(' / '));
  addField('别名', unique(cards.reduce((all, card) => all.concat(array(card.aliases).map(text)), [])).join(' / '));

  addSection('一句话讲给客人', unique(cards.map((card) => text(card.one_liner))).map((body) => ({ body })));
  addSection('速记卡', cards.reduce((all, card) => all.concat(array(card.quick_facts).map((fact) => ({ title: text(fact.label), body: text(fact.value) }))), []));
  addSection('客户话术', cards.reduce((all, card) => all.concat(array(card.customer_pitches).map((pitch) => ({ title: text(pitch.scene), body: text(pitch.line) }))), []));

  const sellingPoints = [];
  const pointSources = cards.reduce((all, card) => all.concat(array(card.selling_points_rich), array(card.selling_points)), []).concat(array(raw.selling_points), array(analysis.selling_points), array(analysis.sellingPoints), array(legacy.selling_points), array(legacy.sellingPoints));
  for (const point of pointSources) {
    const title = typeof point === 'string' ? text(point) : text(point && point.text);
    if (!title) continue;
    const previous = sellingPoints.find((entry) => entry.title === title);
    const body = text(point && point.detail);
    const tag = text(point && point.tag);
    if (previous) { previous.body = previous.body || body; previous.tag = previous.tag || tag; }
    else sellingPoints.push({ title, body, tag });
  }
  addSection('核心卖点', sellingPoints);
  addSection('易混对比', cards.reduce((all, card) => all.concat(array(card.comparisons).map((comparison) => ({ title: text(comparison.name), body: text(comparison.diff) }))), []));

  const tips = [];
  for (const value of [raw.tips, analysis.tips, legacy.tips].concat(cards.map((card) => card.tips))) {
    const structured = record(value);
    if (text(structured.memory)) tips.push({ title: '记忆提示', body: text(structured.memory) });
    if (text(structured.objection)) tips.push({ title: '异议应对', body: text(structured.objection) });
    if (typeof value === 'string' && !Object.keys(structured).length && text(value)) tips.push({ body: text(value) });
    if (Array.isArray(value)) tips.push(...value.map((tip) => ({ body: text(tip) })).filter((tip) => tip.body));
  }
  addSection('实用提示', tips);

  const stories = [raw.story, analysis.story, legacy.story].map(text);
  const pitches = [];
  for (const value of [raw.pitch, analysis.pitch, legacy.pitch]) {
    if (typeof value === 'string' && text(value)) pitches.push({ body: text(value) });
    const pitch = record(value);
    if (text(pitch.opener)) pitches.push({ title: '开场介绍', body: text(pitch.opener) });
    if (text(pitch.highlight)) pitches.push({ title: '商品亮点', body: text(pitch.highlight) });
    if (text(pitch.story)) stories.push(text(pitch.story));
  }
  addSection('商品故事', unique(stories).map((body) => ({ body })));
  addSection('介绍话术', pitches);

  return {
    fields, sections,
    body: text(raw.body) || text(raw.description) || cards.map((card) => text(card.body) || text(card.summary)).find(Boolean) || '',
    gallery: unique(array(raw.gallery).map((image) => media(typeof image === 'string' ? image : image && image.url))),
    backstampUrl: media(raw.backstamp_url), videoUrl: media(raw.video_url)
  };
}

module.exports = { businessContent };

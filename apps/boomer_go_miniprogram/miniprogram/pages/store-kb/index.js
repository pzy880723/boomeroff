const { definePage } = require('../../shared/page');
const model = require('./model');
const markdown = require('./markdown');
Page(definePage({
  data: { type: '', typeLabel: '', shopName: '', reading: false, items: [], categories: [], selectedCategory: null, query: '', hasMore: false, entry: null, blocks: [], canCreate: false, canEdit: false, asOf: '' },
  onLoad(query) { this._type = query.type; this._id = query.id || ''; this._epoch = 0; this._visible = false; this._page = -1; this._query = ''; this._category = null; this._scope = model.scope(this); },
  onShow() { this._visible = true; return this.refresh(); },
  onHide() { this.pause(); },
  onUnload() { this.pause(); },
  pause() { this._visible = false; this._epoch++; this.clearView(); },
  syncScope() { const scope = model.scope(this); if (scope === this._scope) return false; this._scope = scope; this._epoch++; this._query = ''; this._category = null; this._page = -1; this.clearView(); this.setData({ query: '', selectedCategory: null }); return true; },
  current(c) { this.syncScope(); return model.active(this, c); },
  clearView() { this._caps = null; this.setData({ items: [], categories: [], entry: null, blocks: [], hasMore: false, canCreate: false, canEdit: false, loading: false, shopName: '', asOf: '' }); },
  async refresh() {
    if (!this._visible || this._gone) return;
    this.syncScope(); this._epoch++; this.clearView(); this._page = -1;
    const c = model.capture(this);
    return this.run(async () => { try {
      const b = model.binding(this); this.setData({ type: b.type, typeLabel: b.type === 'sop' ? '门店 SOP' : '门店问答', reading: !!this._id, shopName: this.session.get().shop.name || '当前授权门店' });
      const caps = await this.api.action('kb-capabilities', b); if (!this.current(c)) return;
      this._caps = model.parseCaps(caps, b); this.setData({ canCreate: this._caps.canWrite });
      if (this._id) {
        const row = await this.api.action('kb-detail', { ...b, id: this._id }); if (!this.current(c)) return;
        const d = model.parseDetail(row, b, this._id); this.setData({ entry: d.entry, blocks: markdown.parse(d.entry.body), canEdit: this._caps.canWrite && d.canEdit, asOf: d.asOf });
      } else await this.fetchPage(0, c);
    } catch (e) { if (!this.current(c)) return; if (e.status === 401 || e.status === 403) this.clearView(); throw e; } });
  },
  async fetchPage(page, c) {
    const b = model.binding(this), p = { ...b, q: this._query, category_id: this._category, page, page_size: 20 };
    const row = await this.api.action('kb-list', p); if (!this.current(c)) return;
    const d = model.parseList(row, p), items = page === 0 ? [] : this.data.items.slice(), ids = new Set(items.map(x => x.id));
    d.items.forEach(x => { if (!ids.has(x.id)) { items.push(x); ids.add(x.id); } }); this._page = page;
    this.setData({ items, categories: d.categories, hasMore: d.hasMore, asOf: d.asOf });
  },
  loadMore() {
    if (this.syncScope() || !this._visible || this.data.loading || !this.data.hasMore || this._id) return;
    const c = model.capture(this);
    return this.run(async () => { try { await this.fetchPage(this._page + 1, c); } catch (e) { if (!this.current(c)) return; if (e.status === 401 || e.status === 403) this.clearView(); throw e; } });
  },
  onQuery(e) { if (!this.syncScope() && this._visible) this.setData({ query: e.detail.value }); },
  search() { if (this.syncScope() || !this._visible) return; if (Array.from(this.data.query).length > 200) { this.setData({ error: '搜索最多 200 字，输入未被截断' }); return; } this._query = this.data.query.trim(); return this.refresh(); },
  category(e) { if (this.syncScope() || !this._visible) return; const id = e.currentTarget.dataset.id || null; if (id && !this.data.categories.some(x => x.id === id)) return; this._category = id; this.setData({ selectedCategory: id }); return this.refresh(); },
  switchType(e) {
    const type = e.currentTarget.dataset.type; if (!model.typeValid(type) || type === this._type) return;
    this._type = type; this._id = ''; this._query = ''; this._category = null; this.setData({ query: '', selectedCategory: null, error: '' }); return this.refresh();
  },
  openCategories() { if (this.syncScope() || !this._visible || this._gone) return; try { const b = model.binding(this); this.navigate('/pages/store-kb-categories/index?type=' + b.type); } catch (_) {} },
  open(e) { const id = e.currentTarget.dataset.id; if (this.syncScope() || !this._visible || !this.data.items.some(x => x.id === id)) return; this.navigate('/pages/store-kb/index?type=' + this._type + '&id=' + id); },
  create() { if (!this.syncScope() && this._visible && this.data.canCreate) this.navigate('/pages/store-kb-edit/index?type=' + this._type); },
  edit() { if (!this.syncScope() && this._visible && this.data.canEdit) this.navigate('/pages/store-kb-edit/index?type=' + this._type + '&id=' + this._id); }
}));

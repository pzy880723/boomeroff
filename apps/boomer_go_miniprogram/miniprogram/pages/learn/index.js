const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: {
    query: '', kind: 'knowledge', source: 'product', category: '', items: [], allItems: [], mastery: 'all', loadedSummary: '', pagingNote: '', categories: [], freshness: '', hasMore: false, loadingMore: false,
    filters: [
      { kind: 'knowledge', label: '知识' }, { kind: 'training', label: '培训' },
      { kind: 'quiz', label: '测验' }, { kind: 'quiz-history', label: '记录' }
    ]
  },
  onLoad() { this._hidden = false; return this.load(); },
  onShow() { const hidden = this._hidden; this._hidden = false; if (hidden || (this._loadedIdentity && this._loadedIdentity !== model.scope(this))) return this.load(); },
  onHide() { model.hideLearning(this); },
  onUnload() { model.hideLearning(this); this._gone = true; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    this._cursor = null;
    this._nextPage = null;
    return model.remote(this, () => this.api.action(this.actionName(), Object.assign({}, this.params(), { page: 0 })), (data) => {
      if (model.learningCollection(this.data.kind)) {
        model.showLearning(this, data, 0, false);
        this.setData({ categories: [], freshness: model.freshness(data) });
        return;
      }
      this.setData({ items: model.items(data), categories: model.categories(data), freshness: model.freshness(data), hasMore: model.pagination(this, data, 0) });
    }, { items: [], allItems: [], loadedSummary: '', pagingNote: '', freshness: '', hasMore: false, loadingMore: false });
  },
  actionName() { return this.data.kind === 'quiz' ? 'my-library' : (this.data.kind === 'quiz-history' ? 'quiz-history' : (this.data.kind === 'knowledge' ? 'knowledge' : 'learning')); },
  params() { return model.listParams(this.data.kind, this.data.query.trim(), this.data.category, this.data.source); },
  loadMore() { return model.loadMore(this, this.actionName(), this.params()); },
  onSearchInput(event) { this.setData({ query: event.detail.value }); },
  onSearch() { return model.learningCollection(this.data.kind) ? model.filterLearning(this) : this.load(); },
  onMastery(event) {
    const mastery = event.currentTarget.dataset.mastery;
    if (['all', 'pending', 'mastered'].indexOf(mastery) < 0) return;
    this.setData({ mastery }); model.filterLearning(this);
  },
  onFilter(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!this.data.filters.some((filter) => filter.kind === kind)) return;
    this.setData({ kind, query: '', category: '', categories: [] });
    return this.load();
  },
  onCategory(event) { this.setData({ category: event.currentTarget.dataset.id }); return this.load(); },
  onSource(event) {
    const source = event.currentTarget.dataset.source;
    if (source !== 'official' && source !== 'product') return;
    this.setData({ source, category: '', categories: [] });
    return this.load();
  },
  openItem(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.items.find((entry) => entry.id === id);
    if (!item) return;
    if (model.learningCollection(this.data.kind)) return model.openLearning(this, item);
    if (this._hidden || this._loadedIdentity !== model.scope(this)) return;
    if (this.data.kind === 'knowledge') return this.navigate(model.detailUrl(item.quizKind === 'official' || this.data.source === 'official' ? 'official' : 'knowledge', id));
    return this.navigate(model.detailUrl(this.data.kind, id));
  },
  retry() { return this.load(); }
}));

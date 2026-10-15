const { definePage } = require('../../shared/page');
const model = require('../list/model');

function coordinator() { return getApp().dailyPractice; }

Page(definePage({
  data: { readReady: false, updatedText: '', practice: { date: '', ready: false, libraryCount: 0, hasOlder: false, asOf: '', attemptedCount: 0, recommendations: [], queue: [], current: null, index: 0, active: false, finished: false, completedCount: 0, skippedCount: 0, progressError: '', preview: false } },
  onLoad() { this._hidden = false; return this.load(); },
  onShow() {
    const hidden = this._hidden;
    this._hidden = false;
    this._navigating = false;
    if (hidden || (this._identity && this._identity !== model.scope(this))) return this.load();
  },
  onHide() { this._hidden = true; this._request = (this._request || 0) + 1; this._modalOpen = false; this._modalToken = (this._modalToken || 0) + 1; },
  onUnload() { this.onHide(); this._gone = true; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  active(serial, identity, helper) { return !this._hidden && !this._gone && this._request === serial && model.scope(this) === identity && coordinator() === helper; },
  syncPractice() {
    const helper = coordinator();
    if (!helper || this._hidden || this._gone) return;
    const practice = helper.view();
    this.setData({ practice, updatedText: model.formatTime(practice.asOf) });
  },
  load() {
    if (this._hidden || this._gone || this._modalOpen) return Promise.resolve();
    const serial = (this._request || 0) + 1;
    this._request = serial;
    const identity = model.scope(this), helper = coordinator();
    this._identity = identity;
    this.setData({ readReady: false });
    this.syncPractice();
    return this.run(async () => {
      try {
        if (!identity || !helper) throw new Error('连续练习尚未就绪，请重新登录后再试');
        const stamp = helper.stamp();
        const dto = await this.api.action('practice-library', {});
        if (!this.active(serial, identity, helper)) return;
        helper.setLibrary(dto, stamp);
        this.syncPractice();
        if (!this.data.practice.ready) throw new Error('连续练习窗口尚未确认，请重新读取');
        this.setData({ readReady: true });
      } catch (error) { if (this.active(serial, identity, helper)) throw error; }
    });
  },
  startPractice() {
    if (this._navigating || this._hidden || this._gone || this.data.loading || !this.data.readReady || this.data.error || this._identity !== model.scope(this)) return;
    const helper = coordinator();
    if (!helper) return;
    try {
      const view = helper.view();
      if (!view.ready) throw new Error('员工、门店或日期已变化，请刷新推荐');
      if (!view.active || view.finished) helper.start();
      this.syncPractice();
      return this.continuePractice();
    } catch (error) { this.setData({ error: error.message }); }
  },
  continuePractice() {
    if (this._navigating || this._hidden || this._gone || this.data.loading || !this.data.readReady || this.data.error || this._identity !== model.scope(this)) return;
    const helper = coordinator();
    if (!helper) return;
    try {
      const view = helper.view();
      if (!view.ready || !view.current) return this.syncPractice();
      if (view.current.state === 'completed') helper.next(view.current.id);
      this.syncPractice();
      const current = this.data.practice.current;
      if (current && helper.matches(current.id)) return this.redirectReading(current.id);
    } catch (error) { this.setData({ error: error.message }); }
  },
  redirectReading(id) {
    const serial = this._request, identity = this._identity, helper = coordinator();
    this._navigating = true;
    wx.redirectTo({ url: '/pages/detail/index?kind=favorite&id=' + encodeURIComponent(id) + '&practice=1', fail: () => {
      if (this.active(serial, identity, helper)) { this._navigating = false; this.setData({ error: '阅读页面未能打开，请重试继续本轮' }); }
    } });
  },
  confirmAction(skip) {
    if (this._hidden || this._gone || this._modalOpen || this._navigating || this.data.loading || this._identity !== model.scope(this)) return;
    const helper = coordinator();
    if (!helper) return;
    const view = helper.view();
    if (!view.active || (skip && (!view.current || !helper.matches(view.current.id)))) return;
    const id = view.current && view.current.id;
    const serial = this._request, identity = this._identity, stamp = helper.stamp();
    const token = (this._modalToken || 0) + 1;
    this._modalToken = token; this._modalOpen = true;
    wx.showModal({ title: skip ? '跳过当前知识？' : '结束本轮练习？', content: skip ? '跳过不计练过，也不计已掌握。之后仍可单独学习这条知识。' : '本轮队列会结束，已确认的本机今日练习进度保留；未完成题目不会恢复。',
      success: (result) => {
        if (!this._modalOpen || token !== this._modalToken || !this.active(serial, identity, helper)) return;
        this._modalOpen = false;
        if (!result.confirm) return;
        try {
          if (helper.stamp() !== stamp) throw new Error('员工、门店或日期已变化，请刷新推荐');
          if (skip) { if (!helper.matches(id)) throw new Error('当前条目已变化，请核对本轮清单'); helper.skip(id); } else helper.exit();
          this.syncPractice();
        } catch (error) { this.setData({ error: error.message }); }
      },
      fail: () => { if (token === this._modalToken) this._modalOpen = false; }
    });
  },
  skipPractice() { return this.confirmAction(true); },
  exitPractice() { return this.confirmAction(false); },
  retry() { return this.load(); }
}));

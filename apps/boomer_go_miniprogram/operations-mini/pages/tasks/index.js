const { day, validId, photoType, MAX_PHOTO } = require('../../shared/operations');
const labels = { pending: '待完成', in_progress: '进行中', completed: '已完成' };
const newId = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const read = path => new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
  filePath: path, success: ({ data }) => resolve(data), fail: () => reject(new Error('无法读取照片，请重新选择'))
}));

Page({
  data: { loading: true, busy: '', error: '', id: '', date: '', today: '', shop: null, task: null,
    writes: false, title: '', description: '', required: 1, counts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], note: '' },
  onLoad(options) {
    this._active = true;
    this._pictures = new Map();
    const ops = getApp().operations, scope = ops.current();
    if (!scope) return this.login();
    let shopId = options.shop;
    try { shopId = decodeURIComponent(shopId); } catch (_) {}
    const shop = scope.shops.find(item => item.id === options.shop || item.id === shopId);
    const id = options.id || '';
    if (!shop || !/^\d{4}-\d{2}-\d{2}$/.test(options.date || '') || (id && !validId(id))) {
      return this.setData({ loading: false, error: '任务链接无效或不属于当前门店，请返回工作台。' });
    }
    if (!id && !(scope.writes && scope.canManage)) {
      return this.setData({ loading: false, error: '当前账号不能布置门店任务。' });
    }
    this.setData({ id, date: options.date, today: day(), shop, writes: scope.writes, loading: Boolean(id) });
    if (id) return this.refresh();
  },
  onUnload() {
    this._active = false;
    for (const path of this._pictures.values()) wx.getFileSystemManager().unlink({ filePath: path, fail() {} });
  },
  login() { wx.reLaunch({ url: '/pages/login/index' }); },
  onPullDownRefresh() { return this.refresh().finally(() => wx.stopPullDownRefresh()); },
  async refresh() {
    if (!this.data.id || this._fetching || this.data.busy) return;
    this._fetching = true;
    this.setData({ loading: true, error: '' });
    const { shop, date, id } = this.data;
    const ops = getApp().operations;
    try {
      const task = await ops.task(shop.id, date, id);
      if (this._active) this.showTask(task);
    } catch (error) {
      if (this._active) this.fail(error);
    } finally {
      this._fetching = false;
      if (this._active) this.setData({ loading: false });
    }
  },
  showTask(task) {
    this.setData({ task: { ...task, label: labels[task.status] || '待确认' }, writes: getApp().operations.current().canUpdate });
  },
  fail(error) {
    if (!getApp().operations.current()) return this.login();
    this.setData({ error: error.message || '操作未能确认，请稍后重试' });
  },
  input(event) {
    const field = event.currentTarget.dataset.field;
    if (!this.data.busy && ['title', 'description', 'note'].includes(field)) this.setData({ [field]: event.detail.value });
  },
  count(event) { if (!this.data.busy) this.setData({ required: Number(event.detail.value) }); },
  async create() {
    if (this.data.id || this.data.busy || !this.data.shop) return;
    const { shop, date, title, description, required } = this.data;
    if (!title.trim()) return this.setData({ error: '请先填写任务名称' });
    const form = { shop_id: shop.id, date, title: title.trim(), description: description.trim(), required_photos: required };
    const fingerprint = JSON.stringify(form);
    if (this._create?.fingerprint !== fingerprint) this._create = { fingerprint, id: newId() };
    this.setData({ busy: 'create', error: '' });
    try {
      const task = await getApp().operations.createTask({ ...form, request_id: this._create.id });
      if (!this._active) return;
      this.setData({ id: task.id, title: '', description: '' });
      this.showTask(task);
      wx.showToast({ title: '任务已布置' });
    } catch (error) {
      if (this._active) this.fail(error);
    } finally { if (this._active) this.setData({ busy: '' }); }
  },
  async addPhoto() {
    const task = this.data.task;
    if (!task || !this.data.writes || this.data.busy || this.data.loading ||
        task.status === 'completed' || task.photos.length >= 9) return;
    this.setData({ busy: 'photo', error: '' });
    const ops = getApp().operations;
    try {
      const selected = await new Promise((resolve, reject) => wx.chooseMedia({
        count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['camera', 'album'],
        success: ({ tempFiles }) => resolve(tempFiles[0]),
        fail: error => /cancel/i.test(error.errMsg || '') ? resolve(null) :
          reject(new Error('无法打开相机或相册，请检查微信权限'))
      }));
      if (!this._active || !selected) return;
      if (selected.size > MAX_PHOTO) throw new Error('照片超过 6 MB，请选择较小的照片或重新拍摄');
      const content = await read(selected.tempFilePath);
      if (!this._active) return;
      await ops.uploadPhoto(task, content);
      const updated = await ops.task(task.shop_id, task.date, task.id);
      if (this._active) this.showTask(updated);
    } catch (error) {
      if (this._active) this.fail(error);
    } finally { if (this._active) this.setData({ busy: '' }); }
  },
  async preview(event) {
    const task = this.data.task, id = event.currentTarget.dataset.id;
    if (!task || this.data.busy || this.data.loading) return;
    this.setData({ busy: 'preview', error: '' });
    try {
      const content = await getApp().operations.photo(task, id);
      if (!this._active) return;
      const fs = wx.getFileSystemManager();
      const path = wx.env.USER_DATA_PATH + '/go-proof-' + newId() + '.' + photoType(content).split('/')[1];
      await new Promise((resolve, reject) => fs.writeFile({
        filePath: path, data: content, success: resolve, fail: () => reject(new Error('无法打开照片'))
      }));
      if (!this._active) return fs.unlink({ filePath: path, fail() {} });
      const prior = this._pictures.get(id);
      if (prior) fs.unlink({ filePath: prior, fail() {} });
      this._pictures.set(id, path);
      wx.previewImage({ current: path, urls: [path], fail: () => this._active && this.setData({ error: '无法预览照片，请重试' }) });
    } catch (error) {
      if (this._active) this.fail(error);
    } finally { if (this._active) this.setData({ busy: '' }); }
  },
  async complete() {
    const { task, note, busy, writes, loading } = this.data;
    if (!task || !writes || busy || loading || task.status === 'completed' || task.photos.length < task.required_photos) return;
    this.setData({ busy: 'complete', error: '' });
    try {
      const confirmed = await new Promise(resolve => wx.showModal({
        title: '确认完成任务？', content: '完成后将保存照片和备注，不能继续修改。',
        confirmText: '确认完成', success: result => resolve(result.confirm), fail: () => resolve(false)
      }));
      if (!this._active || !confirmed) return;
      const updated = await getApp().operations.completeTask(task, note.trim());
      if (!this._active) return;
      this.showTask(updated);
      this.setData({ note: '' });
      wx.showToast({ title: '任务已完成' });
    } catch (error) {
      if (this._active) this.fail(error);
    } finally { if (this._active) this.setData({ busy: '' }); }
  }
});

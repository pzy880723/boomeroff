const { definePage } = require('../../shared/page');
const { checked, scopeKey, assetView } = require('../marketing/model');

function accountView(account) {
  return { id: account.id, name: account.account_name || account.platform || '门店账号', platform: account.platform || '',
    eligible: account.worker_online !== false && account.online === true && account.cookie_status !== 'expired' && !!(account.worker_account_key || account.worker_account_id), selected: false };
}
Page(definePage({
  data: { id: '', asset: null, loaded: false, notice: '', accounts: [], accountsLoaded: false, selectedAccountIds: [], publishTitle: '', publishBody: '', publishTags: '', publishJobId: '', publishJob: null, targets: [] },
  onLoad(options) {
    this._disposed = false;
    this._visible = true;
    this._scope = scopeKey(this.session);
    this.setData({ id: options.id || '', publishJobId: options.jobId || '' });
    return this.data.id ? this.load() : this.data.publishJobId ? this.refreshPublish() : this.run(async () => { throw new Error('缺少素材或发布任务标识'); });
  },
  onShow() {
    const hidden = this._visible === false;
    this._visible = true;
    const scope = scopeKey(this.session);
    if (scope !== this._scope) this.setData({ asset: null, loaded: false, accounts: [], accountsLoaded: false, selectedAccountIds: [], publishTitle: '', publishBody: '', publishTags: '', publishJobId: '', publishJob: null, targets: [], notice: '', error: '' });
    this._scope = scope;
    if (this.data.id && (!this.data.loaded || hidden && this.data.asset && this.data.asset.kind === 'copy')) return this.load();
    if (this.data.publishJobId) return this.refreshPublish();
  },
  onHide() { this._visible = false; this._manualCopyContext = null; this._assetLoad = null; },
  onUnload() { this.onHide(); this._disposed = true; },
  async fetchAsset() {
    const scope = scopeKey(this.session);
    const response = checked(await this.api.action('marketing-detail', { id: this.data.id }), '素材暂不可用');
    if (this._disposed || !this._visible || scope !== scopeKey(this.session)) return null;
    const row = response.item;
    if (!row || !row.id || row.id !== this.data.id) throw new Error('素材已撤回或暂无访问权限');
    const asset = assetView(row), user = this.session.get();
    asset.canEditManual = !!(user && user.shop && row.user_id === user.userId && row.shop_id === user.shop.id && row.kind === 'copy' && row.meta && row.meta.source === 'manual_upload' && row.meta.asset_class === 'upload');
    return asset;
  },
  load() {
    if (this._disposed || !this._visible) return;
    const scope = scopeKey(this.session);
    if (this._assetLoad && this._assetLoad.scope === scope) return this._assetLoad.promise;
    const read = { scope };
    this._assetLoad = read;
    this._manualCopyContext = null;
    if (this.data.asset && this.data.asset.kind === 'copy') this.setData({ asset: null, loaded: false, publishTitle: '', publishBody: '', publishTags: '' });
    read.promise = this.run(async () => {
      try {
        const asset = await this.fetchAsset();
        if (!asset || this._disposed || !this._visible || this._assetLoad !== read || scope !== scopeKey(this.session)) return;
        this._manualCopyContext = asset.canEditManual ? { id: asset.id, scope } : null;
        this.setData({ asset, loaded: true, publishTitle: asset.copyTitle, publishBody: asset.copyBody, publishTags: asset.copyTags.join(' ') });
      } catch (error) {
        if (this._disposed || !this._visible || this._assetLoad !== read || scope !== scopeKey(this.session)) return;
        throw error;
      }
    }).finally(() => { if (this._assetLoad === read) this._assetLoad = null; });
    return read.promise;
  },
  openManualCopy() {
    const context = this._manualCopyContext;
    if (this._disposed || !this._visible || this.data.loading || !context || context.scope !== scopeKey(this.session) || context.id !== this.data.id) return;
    return this.navigate('/pages/manual-copy/index?id=' + encodeURIComponent(context.id));
  },
  saveVideo() { return this.saveOriginal(false); },
  saveCover() { return this.saveOriginal(true); },
  saveOriginal(cover) {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      this.setData({ notice: '' });
      const asset = await this.fetchAsset();
      if (!asset || this._disposed || scope !== scopeKey(this.session)) return;
      if (!cover && !asset.ready) throw new Error(asset.sourceError || '素材尚未生成完成，请刷新任务状态');
      const url = cover ? asset.coverUrl : asset.originalUrl;
      if (!url) throw new Error(cover ? asset.coverError || '服务端尚未提供独立封面' : asset.sourceError || '服务端尚未提供原文件');
      const result = await this.api.saveMedia(url, !cover && asset.kind === 'video' ? 'video' : 'image');
      if (result && result.saved === false) throw new Error('微信尚未确认保存成功');
      if (!this._disposed && scope === scopeKey(this.session)) this.setData({ asset, notice: cover ? '封面已保存到系统相册' : '原文件已保存到系统相册' });
    });
  },
  copyText() {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      this.setData({ notice: '' });
      const asset = await this.fetchAsset();
      if (!asset || this._disposed || scope !== scopeKey(this.session)) return;
      if (!asset.copyText) throw new Error('该素材没有已保存的发布文案');
      await this.api.copy(asset.copyText);
      if (!this._disposed && scope === scopeKey(this.session)) this.setData({ notice: '文案已复制', asset });
    });
  },
  loadAccounts() {
    const scope = scopeKey(this.session);
    return this.run(async () => {
      const session = this.session.get();
      if (!session || !session.shop) throw new Error('请先登录并绑定门店');
      const response = checked(await this.api.invoke('dispatch-account-list', { shop_id: session.shop.id }), '发布账号暂不可用');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      const accounts = (response.accounts || []).map(accountView);
      this.setData({ accounts, accountsLoaded: true, selectedAccountIds: [], notice: response.worker_online === false ? '发布服务器离线，当前不能提交发布' : '' });
    });
  },
  selectAccount(event) {
    if (this.data.loading) return;
    const id = event.currentTarget.dataset.id;
    const account = this.data.accounts.find(item => item.id === id);
    if (!account || !account.eligible) return;
    const selected = this.data.selectedAccountIds.includes(id) ? this.data.selectedAccountIds.filter(value => value !== id) : this.data.selectedAccountIds.concat(id);
    this.setData({ selectedAccountIds: selected, accounts: this.data.accounts.map(item => ({ ...item, selected: selected.includes(item.id) })) });
  },
  publishInput(event) {
    const field = event.currentTarget.dataset.field;
    if (['publishTitle', 'publishBody', 'publishTags'].includes(field)) this.setData({ [field]: event.detail.value });
  },
  publish() {
    if (this.data.loading || this.data.publishJobId) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      this.setData({ notice: '' });
      const asset = await this.fetchAsset();
      if (!asset || this._disposed || scope !== scopeKey(this.session)) return;
      if (asset.kind !== 'video' || !asset.ready) throw new Error('请等待真实视频成片后再发布');
      if (!this.data.publishTitle.trim()) throw new Error('请先确认发布标题');
      const ids = this.data.selectedAccountIds;
      if (!ids.length) throw new Error('请至少选择一个在线门店账号');
      const session = this.session.get();
      if (!session || !session.shop) throw new Error('请先登录并绑定门店');
      const latest = checked(await this.api.invoke('dispatch-account-list', { shop_id: session.shop.id }), '发布账号状态暂不可用');
      const eligible = (latest.accounts || []).map(accountView).filter(account => account.eligible);
      if (!ids.every(id => eligible.some(account => account.id === id))) throw new Error('所选账号已离线或登录失效，请刷新后重新选择');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      const response = checked(await this.api.invoke('dispatch-job-create', {
        kind: 'video', asset_id: asset.id, account_ids: ids, title: this.data.publishTitle.trim(), body: this.data.publishBody.trim(),
        tags: this.data.publishTags.split(/[\s,，]+/).filter(Boolean).map(tag => tag.replace(/^#/, '')), per_platform: {}, schedule_at: null,
      }), '发布任务提交失败');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (!response.job_id) throw new Error('尚未确认发布任务编号，请先核验任务记录，勿重复提交');
      this.setData({ publishJobId: response.job_id, notice: '已提交发布队列，尚未确认平台发布成功' });
      await this.readPublish();
    });
  },
  async readPublish() {
    const scope = scopeKey(this.session);
    if (!this.data.publishJobId) throw new Error('缺少发布任务标识');
    const response = checked(await this.api.invoke('dispatch-job-status', { job_id: this.data.publishJobId }), '发布任务查询失败');
    if (this._disposed || scope !== scopeKey(this.session)) return;
    if (!response.job || !response.job.id) throw new Error('发布任务返回不完整');
    // Keep native page data free of worker credentials and cookie fields.
    const job = { id: response.job.id, status: response.job.status, title: response.job.title || '' };
    const targets = (response.targets || []).map(target => ({ id: target.id, status: target.status, progress: Number(target.progress) || 0,
      error: target.error_message || '', platform: target.account && target.account.platform || target.platform || '', name: target.account && target.account.account_name || '', postUrl: target.post_url || '' }));
    this.setData({ publishJob: job, targets });
  },
  refreshPublish() { return this.run(() => this.readPublish()); },
  retryTarget(event) {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      const id = event.currentTarget.dataset.id;
      if (!this.data.targets.some(target => target.id === id && target.status === 'failed')) throw new Error('仅支持重试当前任务中失败的目标');
      const response = checked(await this.api.invoke('dispatch-job-retry', { target_id: id }), '发布重试未确认');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (response.ok !== true) throw new Error('发布重试未确认');
      this.setData({ notice: '失败目标已重新加入发布队列，并非已发布' }); await this.readPublish();
    });
  },
  cancelPublish() {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.publishJob || !['queued', 'scheduled'].includes(this.data.publishJob.status)) throw new Error('当前任务已执行或结束，不能取消');
      const response = checked(await this.api.invoke('dispatch-job-cancel', { job_id: this.data.publishJobId }), '取消任务未确认');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (response.ok !== true) throw new Error('取消任务未确认');
      this.setData({ notice: '服务端已确认取消尚未派单的任务' }); await this.readPublish();
    });
  },
  retry() { return this.data.publishJobId ? this.refreshPublish() : this.load(); },
}));

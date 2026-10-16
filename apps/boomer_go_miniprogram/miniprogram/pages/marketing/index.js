const { definePage } = require('../../shared/page');
const { checked, scopeKey, mediaSource, assetView, renderView } = require('./model');

Page(definePage({
  data: {
    tab: 'create', scriptJobId: '', videoJobId: '', taskMode: 'legacy', status: 'empty', statusLabel: '尚未创建任务',
    script: null, result: null, references: [], selectedReferences: [], referenceItems: [], referencePicker: false,
    conversation: [], pendingChanges: [], chatInput: '', contentScope: 'all', dirty: false, notice: '',
    videoUrl: '', coverUrl: '', taskError: '', progress: '', items: [], libraryLoaded: false,
    libraryPage: -1, libraryHasMore: false, libraryLoading: false, libraryError: '',
    referencePage: -1, referenceHasMore: false, referenceLoading: false, referenceError: '',
    scopes: [{ key: 'all', label: '全品类' }, { key: 'ceramics', label: '瓷器餐具' }, { key: 'toys', label: '玩具公仔' }, { key: 'music', label: '唱片音响' }, { key: 'accessories', label: '首饰配饰' }],
  },
  onLoad(options) { this._disposed = false; this._visible = true; this._epoch = 0; this._assetReads = {}; this._scope = scopeKey(this.session); if (options && options.tab === 'library') this.setData({ tab: 'library' }); },
  onShow() {
    this._visible = true;
    const scope = scopeKey(this.session);
    if (this._scope !== undefined && scope !== this._scope) {
      this._epoch++;
      this.invalidateAssetReads();
      this._draftWrite = null; this._draftError = null;
      this.setData({ scriptJobId: '', videoJobId: '', script: null, result: null, references: [], selectedReferences: [], conversation: [], pendingChanges: [], items: [], referenceItems: [], referencePicker: false, libraryLoaded: false, libraryPage: -1, libraryHasMore: false, libraryError: '', referencePage: -1, referenceHasMore: false, referenceError: '', dirty: false, status: 'empty', statusLabel: '尚未创建任务', videoUrl: '', coverUrl: '', notice: '', taskError: '' });
    }
    this._scope = scope;
    return this.data.tab === 'library' ? this.loadLibrary() : this.restore();
  },
  onHide() { this._visible = false; this.invalidateAssetReads(); this.stopPolling(); this.persistDraftInBackground(); },
  onUnload() { this.persistDraftInBackground(); this.invalidateAssetReads(); this._disposed = true; this._epoch++; this.stopPolling(); },
  invalidateAssetReads() { this._assetReads = {}; this._referenceSave = null; this.setData({ libraryLoading: false, referenceLoading: false }); },
  shopId() { const session = this.session.get(); if (!session || !session.shop || !session.shop.id) throw new Error('请先登录并绑定门店'); return session.shop.id; },
  newManualCopy() {
    if (this._disposed || !this._visible || this._scope !== scopeKey(this.session)) return;
    const user = this.session.get();
    if (user && user.shop && user.shop.id) return this.navigate('/pages/manual-copy/index');
  },
  stopPolling() { if (this._timer) clearTimeout(this._timer); this._timer = null; },
  schedulePoll() {
    this.stopPolling();
    if (this._disposed || !this._visible || this.data.tab !== 'create') return;
    const pendingScript = this.data.status === 'script_generating';
    const pendingVideo = this.data.videoJobId && !['failed', 'cancelled', 'ready_to_stitch'].includes(this.data.status) && this.data.statusLabel !== '已完成';
    if (pendingScript || pendingVideo) this._timer = setTimeout(() => this.refreshTask(), 4000);
  },
  persistDraftInBackground() {
    if (!this.data.dirty || !this.data.scriptJobId || !this.data.script) return;
    const jobId = this.data.scriptJobId;
    const epoch = this._epoch;
    const scope = scopeKey(this.session);
    const script = JSON.parse(JSON.stringify(this.data.script));
    this._draftWrite = Promise.resolve(this._draftWrite).catch(() => {}).then(() => {
      if (scope !== scopeKey(this.session)) return;
      return this.api.invoke('surprise-script-job', { action: 'save_draft', job_id: jobId, script });
    })
      .then(response => { checked(response, '脚本草稿尚未保存'); if (epoch === this._epoch) this._draftError = null; })
      .catch(error => { if (epoch === this._epoch) this._draftError = error; });
  },
  restore() {
    const epoch = this._epoch;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (this._draftWrite) await this._draftWrite;
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (this.data.dirty && this.data.scriptJobId) {
        checked(await this.api.invoke('surprise-script-job', { action: 'save_draft', job_id: this.data.scriptJobId, script: this.data.script }), '脚本草稿尚未保存');
        this._draftError = null;
      } else if (this._draftError) throw this._draftError;
      const response = checked(await this.api.invoke('surprise-script-job', { action: 'current', shop_id: this.shopId() }), '无法恢复当前视频任务');
      if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
      this.acceptTask(response);
      this.schedulePoll();
    });
  },
  acceptTask(response) {
    checked(response, '视频任务返回异常');
    if (response.task_kind === 'none') {
      this.setData({ scriptJobId: '', videoJobId: '', script: null, result: null, references: [], selectedReferences: [], conversation: [], pendingChanges: [], dirty: false, status: 'empty', statusLabel: '尚未创建任务', videoUrl: '', coverUrl: '', taskError: '' });
    } else if (response.task_kind === 'video') {
      const video = mediaSource(response.final_video_url), cover = mediaSource(response.cover_url);
      this.setData({ videoJobId: response.render_job_id || response.job_id, scriptJobId: '', script: null,
        taskMode: response.render_job_id ? 'legacy' : 'director', status: response.status, statusLabel: video.url && response.status === 'done' ? '已完成' : '已恢复视频任务',
        videoUrl: video.url, coverUrl: cover.url, taskError: video.error || cover.error || response.error || '', dirty: false });
    } else {
      if (!response.job_id || !response.status) throw new Error('脚本任务缺少服务端标识，请刷新');
      const references = (Array.isArray(response.picked_assets) ? response.picked_assets : []).map(item => ({
        asset_id: item.asset_id, index: item.index, url: mediaSource(item.url).url,
        summary: typeof item.summary === 'string' ? item.summary : '', category: item.category, role: item.role,
      })).filter(item => item.url);
      this.setData({ scriptJobId: response.job_id, videoJobId: '', status: response.status,
        statusLabel: ({ script_ready: '脚本待确认', script_generating: '正在准备脚本', failed: '脚本生成失败' })[response.status] || response.status,
        script: response.script || null, result: response.result || null, references, selectedReferences: references.map(item => item.url).filter(Boolean),
        conversation: response.conversation || [], pendingChanges: response.pending_changes || [], contentScope: response.content_scope || this.data.contentScope,
        taskError: response.error || '', dirty: false });
    }
  },
  selectScope(event) { if (!this.data.loading && !this.data.scriptJobId && !this.data.videoJobId) this.setData({ contentScope: event.currentTarget.dataset.key }); },
  startScript() {
    if (this.data.loading || this.data.scriptJobId || this.data.videoJobId) return;
    const epoch = this._epoch;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      const response = checked(await this.api.invoke('surprise-script-job', { action: 'start', shop_id: this.shopId(), exclude_asset_ids: [], realism: 'photoreal', content_scope: this.data.contentScope, replace_current: false }), '脚本任务创建失败');
      if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
      this.acceptTask(response); this.setData({ notice: '任务已交给服务端，离开页面后仍可回来查看' }); this.schedulePoll();
    });
  },
  editScript(event) {
    if (!this.data.script || this.data.loading || this.data.status !== 'script_ready') return;
    const { part, index, field } = event.currentTarget.dataset;
    const script = JSON.parse(JSON.stringify(this.data.script));
    const fields = ['scene', 'action', 'dialogue', 'subtitle', 'motion'];
    if (!fields.includes(field)) return;
    const clip = part === 'scene' ? script.scenes[Number(index)] : ['hook', 'outro'].includes(part) ? script[part] : null;
    if (!clip) return;
    clip[field] = event.detail.value;
    if (field === 'dialogue') {
      clip.subtitle = event.detail.value;
      script.continuous_dialogue = [script.hook, ...script.scenes, script.outro].map(item => item.dialogue || '').join('，');
      script.dialogue_char_count = (script.continuous_dialogue.match(/[\u4e00-\u9fa5]/g) || []).length;
    }
    const beatIndex = part === 'hook' ? 0 : part === 'outro' ? script.scenes.length + 1 : Number(index) + 1;
    const beatField = { scene: 'visual', action: 'action', motion: 'motion' }[field];
    if (beatField && Array.isArray(script.visual_beats) && script.visual_beats[beatIndex]) script.visual_beats[beatIndex][beatField] = event.detail.value;
    this.setData({ script, dirty: true, notice: '' });
  },
  saveScript() {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (this._draftWrite) await this._draftWrite;
      if (this._disposed || scope !== scopeKey(this.session)) return;
      const response = checked(await this.api.invoke('surprise-script-job', { action: 'save', job_id: this.data.scriptJobId, script: this.data.script }), '脚本保存失败');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      this._draftError = null;
      this.acceptTask(response); this.setData({ notice: '当前脚本已由服务端确认保存' });
    });
  },
  generateVideo() {
    if (this.data.loading || this.data.videoJobId) return;
    const epoch = this._epoch;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.scriptJobId || !this.data.script || this.data.status !== 'script_ready') throw new Error('请先等待脚本准备完成');
      if (this.data.pendingChanges.length) throw new Error('请先应用或取消对话中的修改意见，再生成视频');
      if (this._draftWrite) await this._draftWrite;
      if (this._disposed || scope !== scopeKey(this.session)) return;
      const jobId = this.data.scriptJobId;
      // Rendering consumes the persisted script job, never an older preview or a client-only edit.
      checked(await this.api.invoke('surprise-script-job', { action: 'save', job_id: jobId, script: this.data.script }), '脚本保存失败');
      if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
      const response = checked(await this.api.invoke('surprise-marketing-video', {
        script_job_id: jobId, shop_id: this.shopId(), style: this.data.result && this.data.result.style || 'energetic',
        realism: 'photoreal', model: 'doubao-seedance-2-0-260128', resolution: '1080p', preview: false,
      }), '视频任务提交失败');
      if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
      if (!response.job_id) throw new Error('尚未确认视频任务已创建，请刷新当前任务后核验，勿重复提交');
      this.setData({ videoJobId: response.job_id, scriptJobId: '', taskMode: 'legacy', dirty: false, status: 'queued', statusLabel: '排队中', videoUrl: '', coverUrl: '', taskError: '', notice: '已提交视频生成队列，尚未生成成片' });
      this.schedulePoll();
    });
  },
  refreshTask() {
    if (this._polling) return;
    const epoch = this._epoch;
    const scope = scopeKey(this.session);
    this._polling = true;
    return this.run(async () => {
      try {
        if (this.data.videoJobId) {
          const director = this.data.taskMode === 'director';
          const response = await this.api.invoke(director ? 'director-poll-job' : 'poll-marketing-video', { job_id: this.data.videoJobId });
          if (!response || response.status !== 'failed') checked(response, '视频任务查询失败');
          if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
          if (director) {
            const job = response.job;
            if (!job) throw new Error('视频任务返回不完整');
            const video = mediaSource(job.final_video_url), cover = mediaSource(job.cover_url);
            this.setData({ status: job.status, statusLabel: job.status === 'done' && video.url ? '已完成' : job.status === 'ready_to_stitch' ? '分段已生成，等待拼接' : job.status === 'failed' ? '生成失败' : '视频任务处理中', videoUrl: job.status === 'done' ? video.url : '', coverUrl: cover.url, taskError: video.error || cover.error || job.error_message || '' });
          } else this.setData(renderView(response));
        } else if (this.data.scriptJobId) {
          const response = checked(await this.api.invoke('surprise-script-job', { action: 'poll', job_id: this.data.scriptJobId }), '脚本任务查询失败');
          if (this._disposed || epoch !== this._epoch || scope !== scopeKey(this.session)) return;
          if (!this.data.dirty) this.acceptTask(response);
        }
        this.schedulePoll();
      } finally { this._polling = false; }
    }, { silent: true });
  },
  chatInput(event) { this.setData({ chatInput: event.detail.value }); },
  sendScriptMessage() {
    if (this.data.loading || !this.data.chatInput.trim()) return;
    return this.scriptAction('chat', { message: this.data.chatInput.trim() });
  },
  applyConversation() { if (!this.data.loading) return this.scriptAction('apply_conversation'); },
  clearConversation() { if (!this.data.loading) return this.scriptAction('clear_conversation'); },
  scriptAction(action, extra = {}) {
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.scriptJobId || this.data.status !== 'script_ready') throw new Error('脚本尚不可修改');
      if (this._draftWrite) await this._draftWrite;
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (this.data.dirty || action === 'apply_conversation') checked(await this.api.invoke('surprise-script-job', { action: action === 'apply_conversation' ? 'save' : 'save_draft', job_id: this.data.scriptJobId, script: this.data.script }), '脚本草稿保存失败');
      const response = checked(await this.api.invoke('surprise-script-job', { action, job_id: this.data.scriptJobId, ...extra }), '脚本修改失败');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      this.acceptTask(response); this.setData({ chatInput: '' });
    });
  },
  openReferences() {
    if (this.data.loading) return;
    this.setData({ referencePicker: true });
    return this.loadAssetPage(true, false);
  },
  loadMoreReferences() { if (this.data.referencePicker) return this.loadAssetPage(true, true); },
  toggleReference(event) {
    if (this.data.loading) return;
    const url = event.currentTarget.dataset.url;
    if (!this.data.referenceItems.some(item => item.originalUrl === url)) return;
    const selected = this.data.selectedReferences.slice();
    const index = selected.indexOf(url);
    if (index >= 0) selected.splice(index, 1);
    else if (selected.length < 8) selected.push(url);
    else { this.setData({ error: '最多选择 8 张真实门店参考图' }); return; }
    this.setData({ selectedReferences: selected, referenceItems: this.data.referenceItems.map(item => ({ ...item, selected: selected.includes(item.originalUrl) })) });
  },
  saveReferences() {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    const token = this._referenceSave = {};
    const jobId = this.data.scriptJobId;
    const urls = this.data.selectedReferences.slice();
    const current = () => !this._disposed && this._visible && this._referenceSave === token && scope === scopeKey(this.session) && jobId === this.data.scriptJobId;
    return this.run(async () => {
      try {
        if (!urls.length) throw new Error('请至少选择一张店内实景图');
        if (urls.length > 8) throw new Error('最多选择 8 张真实门店参考图');
        const authorized = this.data.referenceItems.map(item => item.originalUrl).concat(this.data.references.map(item => item.url));
        if (!urls.every(url => authorized.includes(url) && mediaSource(url).url)) throw new Error('请仅选择已授权门店素材库中的真实照片');
        for (const url of urls) {
          const info = await new Promise((resolve, reject) => {
            if (typeof wx.getImageInfo !== 'function') return reject(new Error('无法确认参考图尺寸，请稍后重试，不能跳过竖图校验'));
            wx.getImageInfo({ src: url, success: resolve, fail: () => reject(new Error('无法确认参考图尺寸，请检查图片读取权限或网络后重试')) });
          });
          if (!current()) return;
          if (!(info.width > 0 && info.height > 0)) throw new Error('无法确认参考图尺寸，请重新选择可读取的原图');
          if (!(info.height > info.width)) throw new Error('15 秒竖版视频仅支持竖图，请选择高度大于宽度的真实照片');
        }
        if (this._draftWrite) await this._draftWrite;
        if (!current()) return;
        checked(await this.api.invoke('surprise-script-job', { action: 'save', job_id: jobId, script: this.data.script }), '脚本保存失败');
        if (!current()) return;
        const response = checked(await this.api.invoke('surprise-script-job', { action: 'update_assets', job_id: jobId, asset_urls: urls }), '参考图保存失败');
        if (!current()) return;
        this.acceptTask(response); this.setData({ referencePicker: false, notice: '门店参考图已由服务端确认' });
      } catch (error) { if (current()) throw error; }
    });
  },
  closeReferences() { this._assetReads.reference = null; this._referenceSave = null; this.setData({ referencePicker: false, referenceLoading: false, selectedReferences: this.data.references.map(item => item.url).filter(Boolean) }); },
  finishTask() {
    if (this.data.loading) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      const action = this.data.videoJobId ? 'dismiss' : 'discard';
      const jobId = this.data.videoJobId || this.data.scriptJobId;
      checked(await this.api.invoke('surprise-script-job', { action, job_id: jobId }), '当前任务尚不能结束');
      if (this._disposed || scope !== scopeKey(this.session)) return;
      this.stopPolling(); this.acceptTask({ ok: true, task_kind: 'none' }); this.setData({ notice: '已结束当前任务，云端素材不会因此被删除' });
    });
  },
  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (!['create', 'library'].includes(tab) || this.data.loading) return;
    if (tab === this.data.tab) return;
    this.invalidateAssetReads();
    this.setData({ tab, referencePicker: false, error: '', notice: '' });
    if (tab === 'library') { this.stopPolling(); return this.loadLibrary(); }
    return this.restore();
  },
  loadLibrary() { return this.loadAssetPage(false, false); },
  loadMoreLibrary() { return this.loadAssetPage(false, true); },
  loadAssetPage(references, append) {
    if (this._disposed || !this._visible) return;
    const prefix = references ? 'reference' : 'library';
    if (append && (this.data[prefix + 'Loading'] || !this.data[prefix + 'HasMore'])) return;
    const page = append ? this.data[prefix + 'Page'] + 1 : 0;
    const token = this._assetReads[prefix] = {};
    const scope = scopeKey(this.session);
    const tab = this.data.tab;
    const current = () => !this._disposed && this._visible && this._assetReads[prefix] === token && this.data.tab === tab && scope === scopeKey(this.session) && (!references || this.data.referencePicker);
    this.setData({ [prefix + 'Loading']: true, [prefix + 'Error']: '' });
    return this.run(async () => {
      try {
        const params = { page, page_size: 20 };
        if (references) params.kind = 'photo';
        const response = checked(await this.api.action('marketing-assets', params), '素材库暂不可用');
        if (!current()) return;
        if (!Array.isArray(response.items) || (response.page !== undefined && response.page !== page)) throw new Error('素材分页返回异常，请重试');
        let incoming = response.items.map(assetView);
        if (references) incoming = incoming.filter(item => item.kind === 'photo' && item.ready);
        const field = references ? 'referenceItems' : 'items';
        const items = append ? this.data[field].slice() : [];
        const ids = new Set(items.map(item => item.id));
        for (const item of incoming) if (item.id && !ids.has(item.id)) { ids.add(item.id); items.push(item); }
        this.setData({ [field]: references ? items.map(item => ({ ...item, selected: this.data.selectedReferences.includes(item.originalUrl) })) : items,
          [prefix + 'Page']: page, [prefix + 'HasMore']: response.has_more === true, ...(references ? {} : { libraryLoaded: true }) });
      } catch (error) {
        if (current()) {
          if (error.status === 401) throw error;
          this.setData({ [prefix + 'Error']: error.message || '素材分页加载失败，请重试' });
        }
      } finally { if (current()) this.setData({ [prefix + 'Loading']: false }); }
    }, { silent: true });
  },
  openAsset(event) { this.navigate('/pages/asset/index?id=' + encodeURIComponent(event.currentTarget.dataset.id)); },
  saveVideo() {
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.videoUrl) throw new Error('尚未提供完整视频');
      const result = await this.api.saveMedia(this.data.videoUrl, 'video');
      if (result && result.saved === false) throw new Error('微信尚未确认保存成功');
      if (!this._disposed && scope === scopeKey(this.session)) this.setData({ notice: '视频已保存到系统相册' });
    });
  },
  retry() { return this.data.tab === 'library' ? this.loadLibrary() : this.data.scriptJobId || this.data.videoJobId ? this.refreshTask() : this.restore(); },
}));

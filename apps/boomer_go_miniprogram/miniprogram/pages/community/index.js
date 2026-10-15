const { definePage } = require('../../shared/page');
const { scope } = require('../list/model');
const { statistics, checked, postView, commentView, mergeComments, empty } = require('./model');

Page(definePage({
  data: { id: '', ...empty() },
  onLoad(options) {
    this._visible = true; this._epoch = 0; this._version = 0; this._requests = {}; this._confirmed = [];
    this._pendingLike = null; this._pendingComment = null; this._intent = 0; this._identity = ''; this._postId = ''; this._firstShow = true;
    this.setData({ id: typeof options.id === 'string' ? options.id : '' });
    this._initialLoad = this.refresh();
    return this._initialLoad;
  },
  onShow() {
    const first = this._firstShow; this._firstShow = false; this._visible = true;
    if (first && scope(this) === this._identity && this.data.id === this._postId) return this._initialLoad;
    if (!this.ensureScope()) return;
    this.setData({ detailLoading: false, commentsLoading: false, writing: '', canInteract: false });
    return this.refresh();
  },
  onHide() { this._visible = false; this._firstShow = false; this._epoch++; this._requests = {}; },
  onUnload() { this._visible = false; this._epoch++; this._requests = {}; this._pendingComment = null; this._pendingLike = null; this._confirmed = []; },
  ensureScope() {
    if (this._gone || !this._visible) return false;
    const identity = scope(this);
    if (identity !== this._identity || this.data.id !== this._postId) {
      this._identity = identity; this._postId = this.data.id; this._epoch++; this._version++; this._requests = {};
      this._pendingLike = null; this._pendingComment = null; this._confirmed = [];
      this.setData({ ...empty(), error: '' });
    }
    return !!identity;
  },
  begin(channel) {
    if (!this.ensureScope()) return null;
    const context = { channel, identity: scope(this), id: this.data.id, epoch: this._epoch, version: this._version };
    this._requests[channel] = context;
    return context;
  },
  current(context) {
    return !!context && !this._gone && this._visible && this._epoch === context.epoch && scope(this) === context.identity
      && this.data.id === context.id && this._requests[context.channel] === context;
  },
  reject(error, context, field) {
    if (!this.current(context) || error.code === 'stale_operation') return;
    if (error.status === 401) throw error;
    if (error.status === 403 || error.status === 404) {
      this._epoch++; this._version++; this._requests = {}; this._confirmed = []; this._pendingLike = null;
      this.setData({ ...empty(), draft: this.data.draft, draftLocked: !!this._pendingComment, unavailable: true,
        detailError: '帖子不存在、已移除或当前账号无权访问，请返回列表核对。' });
      return;
    }
    const message = error.code === 'request_id_conflict' ? '评论请求记录与原稿不一致，原稿已保留，请刷新核对后重试。'
      : error.code === 'like_state_mismatch' ? '点赞状态尚未确认，请重试核对。' : error.message || '操作尚未确认，请重试';
    this.setData({ [field]: message });
  },
  refresh() {
    if (this._gone || !this._visible) return;
    if (!this.data.id) { this.setData({ detailError: '缺少帖子标识，请从社区列表重新进入。', canInteract: false }); return; }
    const context = this.begin('detail');
    if (!context) return;
    this._requests.comments = null;
    this.setData({ detailLoading: true, detailError: '', commentsLoading: false });
    return this.run(async () => {
      try {
        const response = checked(await this.api.action('community-detail', { id: context.id }));
        if (!this.current(context)) return;
        if (!response.post || response.post.id !== context.id || typeof response.post.name !== 'string') throw new Error('帖子详情返回不完整，请重新加载。');
        const patch = postView(response.post);
        if (context.version === this._version && !this.data.writing) {
          const stats = statistics(response);
          Object.assign(patch, stats || { liked: null, likesCount: null, commentsCount: null }, { canInteract: !!stats && !this.preview });
        }
        this.setData({ ...patch, unavailable: false });
        await this.loadComments(false);
      } catch (error) { this.reject(error, context, 'detailError'); }
      finally { if (this.current(context)) this.setData({ detailLoading: false }); }
    }, { silent: true });
  },
  loadMoreComments() { return this.loadComments(true); },
  retryComments() { return this.loadComments(false); },
  loadComments(append = false) {
    if (!this.ensureScope() || !this.data.post || (append && (!this.data.hasMore || this.data.commentsLoading))) return;
    const context = this.begin('comments');
    const cursor = append ? this.data.nextCursor : null;
    this.setData({ commentsLoading: true, commentsError: '' });
    return this.run(async () => {
      try {
        const params = { post_id: context.id, page_size: 20 };
        if (cursor) params.cursor = cursor;
        const response = checked(await this.api.action('community-comments', params));
        if (!this.current(context)) return;
        if (response.post_id !== context.id || response.order !== 'asc' || !Array.isArray(response.items) || typeof response.has_more !== 'boolean'
          || (response.has_more && (typeof response.next_cursor !== 'string' || !response.next_cursor || response.next_cursor === cursor))) throw new Error('评论分页返回异常，请重试当前页。');
        const items = response.items.map(row => commentView(row, context.id));
        this.setData({ comments: mergeComments(append ? this.data.comments : [], items, this._confirmed),
          commentsLoaded: true, hasMore: response.has_more, nextCursor: response.next_cursor || null });
      } catch (error) { this.reject(error, context, 'commentsError'); }
      finally { if (this.current(context)) this.setData({ commentsLoading: false }); }
    }, { silent: true });
  },
  like() {
    if (!this.ensureScope() || !this.data.canInteract || this.data.writing || this.preview) return;
    const target = this._pendingLike === null ? !this.data.liked : this._pendingLike;
    this._pendingLike = target;
    const context = this.begin('write'); this._version++;
    this.setData({ writing: 'like', likeError: '', notice: '' });
    return this.run(async () => {
      try {
        const response = checked(await this.api.action('community-like', { post_id: context.id, liked: target }));
        if (!this.current(context)) return;
        const stats = statistics(response);
        if (response.post_id !== context.id || !stats || stats.liked !== target) throw new Error('点赞结果尚未确认，请重试同一操作。');
        this._pendingLike = null; this._version++;
        this.setData({ ...stats, canInteract: true });
      } catch (error) { this.reject(error, context, 'likeError'); }
      finally { if (this.current(context)) this.setData({ writing: '' }); }
    }, { silent: true });
  },
  onDraftInput(event) {
    if (!this.ensureScope() || !this.data.post || this.data.unavailable || this.data.writing || this.data.draftLocked) return;
    if (this._pendingComment && event.detail.value.trim() !== this._pendingComment.content) this._pendingComment = null;
    this.setData({ draft: event.detail.value, sendError: '', notice: '' });
  },
  sendComment() {
    if (!this.ensureScope() || !this.data.canInteract || this.data.writing || this.preview) return;
    const content = this.data.draft.trim();
    if (!content || content.length > 1000) { this.setData({ sendError: '去除首尾空白后，评论须为 1–1000 个 UTF-16 字符。' }); return; }
    if (!this._pendingComment) {
      this._intent++;
      this._pendingComment = { post_id: this.data.id, content,
        request_id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 16) + '_' + this._intent.toString(36) };
    }
    const pending = this._pendingComment;
    const userId = this.session.get().userId;
    const context = this.begin('write'); this._version++;
    this.setData({ writing: 'comment', draftLocked: true, sendError: '', notice: '' });
    return this.run(async () => {
      try {
        const response = checked(await this.api.action('community-comment', { ...pending }));
        if (!this.current(context)) return;
        const item = commentView(response.comment, context.id), stats = statistics(response);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) || item.content !== pending.content
          || item.mine !== true || item.author.user_id !== userId || typeof response.replay !== 'boolean' || !stats) throw new Error('评论持久化回执尚未确认，原稿已保留，请重试核对。');
        this._pendingComment = null; this._version++;
        this._confirmed = mergeComments(this._confirmed, [item]);
        this.setData({ ...stats, comments: mergeComments(this.data.comments, [item]), draft: '', draftLocked: false,
          canInteract: true, notice: '服务器已确认评论保存。' });
      } catch (error) {
        if (this.current(context) && error.status === 400) this.setData({ draftLocked: false });
        this.reject(error, context, 'sendError');
      } finally { if (this.current(context)) this.setData({ writing: '' }); }
    }, { silent: true });
  },
  keyboardHeight(event) {
    if (!this.ensureScope()) return;
    const height = Number(event.detail.height);
    this.setData({ keyboardInset: Number.isFinite(height) && height > 0 ? height : 0 });
  },
  retry() { return this.refresh(); },
}));

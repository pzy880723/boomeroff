const { definePage } = require('../../shared/page');
const { scopeKey } = require('../marketing/model');

Page(definePage({
  data: { input: '', messages: [], conversationId: '', sending: false, scrollTarget: '' },
  onLoad() { this._disposed = false; this._turn = 0; this._scope = scopeKey(this.session); },
  onShow() {
    const scope = scopeKey(this.session);
    if (scope !== this._scope) this.newConversation();
    this._scope = scope;
  },
  onUnload() { this._disposed = true; this._turn++; if (this._request && typeof this._request.abort === 'function') this._request.abort(); },
  input(event) { this.setData({ input: event.detail.value }); },
  newConversation() {
    this._turn++;
    if (this._request && typeof this._request.abort === 'function') this._request.abort();
    this._request = null;
    this.setData({ messages: [], conversationId: '', input: '', sending: false, error: '' });
  },
  send() {
    if (this.data.sending || !this.data.input.trim()) return;
    const messages = this.data.messages.filter(message => !message.failed).map(({ role, content }) => ({ role, content }));
    messages.push({ role: 'user', content: this.data.input.trim() });
    this.setData({ input: '' });
    return this.sendMessages(messages);
  },
  retry() {
    if (this.data.sending) return;
    const messages = this.data.messages.filter(message => !message.failed).map(({ role, content }) => ({ role, content }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') return;
    return this.sendMessages(messages);
  },
  sendMessages(history) {
    const turn = ++this._turn;
    const scope = scopeKey(this.session);
    const index = history.length;
    const alive = () => !this._disposed && turn === this._turn && scope === scopeKey(this.session);
    this.setData({ sending: true, messages: history.concat({ role: 'assistant', content: '' }), scrollTarget: 'message-' + index });
    return this.run(async () => {
      try {
        this._request = this.api.assistant(history, this.data.conversationId || null, delta => {
          if (!alive() || typeof delta !== 'string') return;
          const messages = this.data.messages.slice();
          messages[index] = { role: 'assistant', content: messages[index].content + delta };
          this.setData({ messages, scrollTarget: 'message-' + index });
        });
        const result = await this._request;
        if (!alive()) return;
        if (!result || typeof result.text !== 'string' || !result.text.trim()) throw new Error('助手没有返回可用内容，请重试');
        const messages = this.data.messages.slice();
        messages[index] = { role: 'assistant', content: result.text };
        this.setData({ messages, conversationId: result.conversationId || this.data.conversationId });
      } catch (error) {
        if (!alive()) return;
        const messages = this.data.messages.slice();
        messages[index] = { ...messages[index], failed: true };
        this.setData({ messages });
        throw error;
      } finally {
        if (alive()) { this._request = null; this.setData({ sending: false }); }
      }
    });
  },
  copyMessage(event) {
    return this.run(async () => {
      const message = this.data.messages[Number(event.currentTarget.dataset.index)];
      if (message && message.content) await this.api.copy(message.content);
    }, { silent: true });
  },
}));

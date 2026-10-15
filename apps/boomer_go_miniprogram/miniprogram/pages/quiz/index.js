const { definePage } = require('../../shared/page');
const model = require('../list/model');
function practiceCoordinator() { const app = typeof getApp === 'function' ? getApp() : null; return app && app.dailyPractice; }

Page(definePage({
  data: { title: '知识测验', kind: 'favorite', id: '', questions: [], answers: [], current: 0, currentQuestion: null, choices: [], answered: 0, result: null, resultNote: '', review: [], reviewNote: '', submitting: false, locked: false, hint: '' },
  onLoad(options) {
    this._hidden = false;
    this._epoch = 0;
    this._practiceRequested = options.practice === '1';
    this.setData({ kind: options.kind || 'favorite', id: options.id || '', practiceRequested: this._practiceRequested, practiceProgressError: '' });
    this.syncPractice();
    return this.load();
  },
  onShow() {
    const hidden = this._hidden;
    this._hidden = false;
    this._practiceRedirecting = false;
    this.syncPractice();
    this.setData({ submitting: !!this._submitting });
    if (this._identity && this._identity !== model.scope(this)) {
      this._submitSerial = (this._submitSerial || 0) + 1;
      this._submitting = false;
      this._quizToken = null;
      this._submittedAnswers = null;
      this.setData({ questions: [], answers: [], currentQuestion: null, choices: [], result: null, resultNote: '', review: [], reviewNote: '', submitting: false, locked: false, error: '员工或门店已变化，请重新加载测验' });
      return;
    }
    if (hidden && !this.data.questions.length && !this._submittedAnswers) return this.load();
  },
  onHide() { this._epoch = (this._epoch || 0) + 1; model.hideLearning(this); },
  onUnload() { this.onHide(); this._gone = true; this._quizToken = null; this._submittedAnswers = null; },
  load() {
    if (this._hidden || this._submitting) return Promise.resolve();
    this._quizToken = null;
    this._submittedAnswers = null;
    this._attemptPractice = null;
    this._practiceRecorded = false;
    this.setData({ practiceCanNext: false, practiceProgressError: '' });
    this._identity = model.scope(this);
    return model.remote(this, () => {
      if (!this.data.id) throw new Error('缺少测验内容 ID，请从知识库重新进入');
      if (this._practiceRequested && (this.data.kind !== 'favorite' || !practiceCoordinator() || !practiceCoordinator().matches(this.data.id))) throw new Error('本轮连续练习条目已变化，请返回清单核对');
      if (['official', 'favorite', 'knowledge'].indexOf(this.data.kind) < 0) throw new Error('测验来源不支持，请返回知识库');
      return this.api.action('quiz-start', { kind: this.data.kind, id: this.data.id });
    }, (data) => {
      if (!data || typeof data.quiz_token !== 'string' || !data.quiz_token || !Array.isArray(data.questions) || !data.questions.length || data.questions.length > 20) throw new Error('测验接口未提供有效题目与服务器答题凭据，暂不能开始');
      const questions = data.questions.map((question, index) => {
        if (question.index !== index || typeof question.stem !== 'string' || !question.stem.trim() || !Array.isArray(question.options) || question.options.length !== 4 || question.options.some((option) => typeof option !== 'string')) {
          throw new Error('题目格式不完整，请重试');
        }
        // Never place legacy answer keys or pre-submit explanations in view data.
        return { index, stem: question.stem, options: question.options.slice() };
      });
      this._quizToken = data.quiz_token;
      this.setData({ title: data.title || '知识测验', questions, answers: questions.map(() => -1), current: 0, answered: 0 });
      this.updateQuestion();
    }, { questions: [], answers: [], currentQuestion: null, choices: [], result: null, resultNote: '', review: [], reviewNote: '', hint: '', locked: false, answered: 0 });
  },
  updateQuestion() {
    const question = this.data.questions[this.data.current];
    this.setData({
      currentQuestion: question || null,
      choices: question ? question.options.map((text, index) => ({ index, text, letter: String.fromCharCode(65 + index), selected: this.data.answers[this.data.current] === index })) : [],
      answered: this.data.answers.filter((answer) => answer >= 0).length
    });
  },
  choose(event) {
    if (this._hidden || this._submitting || this._submittedAnswers || this.data.result || model.scope(this) !== this._identity) return;
    const index = Number(event.currentTarget.dataset.index);
    const question = this.data.questions[this.data.current];
    if (!question || !Number.isInteger(index) || index < 0 || index >= question.options.length) return;
    const answers = this.data.answers.slice();
    answers[this.data.current] = index;
    this.setData({ answers, hint: '', error: '' });
    this.updateQuestion();
  },
  previous() { if (this.data.current > 0) { this.setData({ current: this.data.current - 1 }); this.updateQuestion(); } },
  next() { if (this.data.current < this.data.questions.length - 1) { this.setData({ current: this.data.current + 1 }); this.updateQuestion(); } },
  jump(event) {
    const current = Number(event.currentTarget.dataset.index);
    if (Number.isInteger(current) && current >= 0 && current < this.data.questions.length) { this.setData({ current }); this.updateQuestion(); }
  },
  async submit() {
    if (this._hidden || this._gone || this._submitting || this.data.result || !this._quizToken) return;
    if (this._practiceRequested && !this._submittedAnswers && (!practiceCoordinator() || !practiceCoordinator().matches(this.data.id))) { this.setData({ error: '本轮连续练习已变化，请返回清单核对；不会自动推进。' }); return; }
    if (this.data.answers.some((answer) => answer < 0) || !this.data.questions.length) {
      this.setData({ hint: '请完成全部题目后提交。' });
      return;
    }
    this._submitting = true;
    const serial = (this._submitSerial || 0) + 1;
    this._submitSerial = serial;
    const epoch = this._epoch;
    const identity = this._identity;
    const active = () => !this._hidden && !this._gone && epoch === this._epoch && this._submitSerial === serial && model.scope(this) === identity;
    this.setData({ submitting: true, locked: true, hint: '' });
    if (!this._submittedAnswers) {
      this._submittedAnswers = this.data.answers.slice();
      const helper = practiceCoordinator();
      if (helper && this.data.kind === 'favorite') {
        try { this._attemptPractice = { helper, stamp: helper.stamp() }; }
        catch (_) { this.setData({ practiceProgressError: '本机练习身份或日期未确认，本次不会自动计入已练。' }); }
      }
    }
    const practiceContext = this._attemptPractice;
    try {
      await this.run(async () => {
        if (model.scope(this) !== this._identity) throw new Error('员工登录已变化，请重新进入测验');
        let data;
        try { data = await this.api.action('quiz-submit', { quiz_token: this._quizToken, answers: this._submittedAnswers }); }
        catch (error) { if (active()) throw error; return; }
        if (!active()) return;
        const result = data;
        if (!result || !Number.isInteger(result.score) || result.total !== this.data.questions.length || result.score < 0 || result.score > result.total || typeof result.passed !== 'boolean' || (!this.preview && result.persisted !== true)) {
          throw new Error('服务器尚未确认评分与保存，请重试原答卷；不会本地判分。');
        }
        if ((result.kind != null && result.kind !== this.data.kind) || (result.id != null && result.id !== this.data.id)
          || (result.submitted != null && (!Array.isArray(result.submitted) || result.submitted.length !== this._submittedAnswers.length || result.submitted.some((answer, index) => answer !== this._submittedAnswers[index])))) throw new Error('评分回执与当前答卷不一致，请核对原答卷');
        const reviewAvailable = Array.isArray(result.correct) && Array.isArray(result.correct_answers)
          && result.correct.length === this.data.questions.length && result.correct_answers.length === this.data.questions.length
          && result.correct.every((correct) => typeof correct === 'boolean')
          && result.correct_answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < 4);
        const optionText = (question, index) => String.fromCharCode(65 + index) + ' · ' + question.options[index];
        this.setData({
          result: { score: result.score, total: result.total, passed: result.passed, persisted: result.persisted === true },
          resultNote: this.preview ? '开发预览评分，未保存真实测验记录' : '服务器已评分并保存本次记录',
          review: reviewAvailable ? this.data.questions.map((question, index) => ({ index, stem: question.stem, selectedText: optionText(question, this._submittedAnswers[index]), correctText: optionText(question, result.correct_answers[index]), verdict: result.correct[index] ? '本题答对' : '本题未答对' })) : [],
          reviewNote: reviewAvailable ? '以下正确选项与逐题结果由服务器在提交后返回。' : '服务器未提供完整逐题回顾；不推测正确选项。'
        });
        this.recordPractice(result, practiceContext);
      });
    } finally {
      if (this._submitSerial === serial) {
        this._submitting = false;
        if (!this._gone && !this._hidden && model.scope(this) === identity) this.setData({ submitting: false });
      }
    }
  },
  recordPractice(receipt, context) {
    if (!context || context.helper !== practiceCoordinator()) return;
    try {
      context.helper.recordAttempt(this.data.id, receipt, context.stamp);
      this._practiceRecorded = true;
      this.syncPractice();
      this.setData({ practiceProgressError: context.helper.view().progressError || '' });
    } catch (error) { this.setData({ practiceProgressError: '本机练习进度未确认：' + error.message + '。以上服务器评分与保存回执不受影响。', practiceCanNext: false }); }
  },
  syncPractice() {
    const helper = practiceCoordinator(), view = helper && helper.view();
    const current = view && view.current;
    const valid = this._practiceRequested && this.data.kind === 'favorite' && current && current.id === this.data.id && (helper.matches(this.data.id) || (this._practiceRecorded && current.state === 'completed'));
    this.setData({ practiceMode: !!valid, practiceCanNext: !!(valid && this._practiceRecorded && this.data.result && current.state === 'completed'), practiceNote: this._practiceRequested ? (valid ? '本轮 ' + (view.index + 1) + ' / ' + view.queue.length + ' · 完整作答后再进入下一条。' : '本轮条目已变化或失效，请返回清单核对。') : '' });
  },
  nextPractice() {
    if (!this._practiceRequested || !this._practiceRecorded || !this.data.result || this._hidden || this._gone || this._submitting || this._practiceRedirecting || this._identity !== model.scope(this)) return;
    const context = this._attemptPractice, helper = practiceCoordinator();
    if (!context || helper !== context.helper) return;
    try {
      if (helper.stamp() !== context.stamp) throw new Error('员工、门店或日期已变化，请返回清单');
      const view = helper.view();
      if (!view.current || view.current.id !== this.data.id || view.current.state !== 'completed') return;
      helper.next(this.data.id);
      const next = helper.view();
      this.setData({ practiceCanNext: false });
      return this.redirectPractice(next.current && helper.matches(next.current.id) ? '/pages/detail/index?kind=favorite&id=' + encodeURIComponent(next.current.id) + '&practice=1' : '/pages/practice/index');
    } catch (error) { this.setData({ practiceProgressError: error.message, practiceCanNext: false }); }
  },
  redirectPractice(url) {
    if (this._practiceRedirecting || this._hidden || this._gone || this._submitting || this._identity !== model.scope(this)) return;
    const identity = this._identity;
    this._practiceRedirecting = true;
    wx.redirectTo({ url, fail: () => { if (!this._hidden && !this._gone && identity === model.scope(this)) { this._practiceRedirecting = false; this.setData({ practiceProgressError: '页面未能打开，请返回本轮清单继续。' }); } } });
  },
  returnPractice() {
    if (!this._practiceRequested || this._hidden || this._gone || this._submitting || this._practiceRedirecting || this._identity !== model.scope(this)) return;
    if (!this._submittedAnswers || this.data.result) return this.redirectPractice('/pages/practice/index');
    const identity = this._identity, epoch = this._epoch;
    wx.showModal({ title: '离开尚未确认的答卷？', content: '未获服务器保存确认，不计入本轮已练。原答卷仅能在当前页重试，返回清单不会自动提交或推进。', success: (result) => {
      if (result.confirm && !this._hidden && !this._gone && identity === model.scope(this) && epoch === this._epoch) this.redirectPractice('/pages/practice/index');
    } });
  },
  retry() { return this._submittedAnswers ? this.submit() : this.load(); }
}));

const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: { title: '知识测验', kind: 'favorite', id: '', questions: [], answers: [], current: 0, currentQuestion: null, choices: [], answered: 0, result: null, resultNote: '', review: [], reviewNote: '', submitting: false, locked: false, hint: '' },
  onLoad(options) {
    this._hidden = false;
    this._epoch = 0;
    this.setData({ kind: options.kind || 'favorite', id: options.id || '' });
    return this.load();
  },
  onShow() {
    const hidden = this._hidden;
    this._hidden = false;
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
    this._identity = model.scope(this);
    return model.remote(this, () => {
      if (!this.data.id) throw new Error('缺少测验内容 ID，请从知识库重新进入');
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
    }
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
      });
    } finally {
      if (this._submitSerial === serial) {
        this._submitting = false;
        if (!this._gone && !this._hidden && model.scope(this) === identity) this.setData({ submitting: false });
      }
    }
  },
  retry() { return this._submittedAnswers ? this.submit() : this.load(); }
}));

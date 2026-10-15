const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: { title: '知识测验', kind: 'favorite', id: '', questions: [], answers: [], current: 0, currentQuestion: null, choices: [], answered: 0, result: null, resultNote: '', review: [], submitting: false, locked: false, hint: '' },
  onLoad(options) {
    this.setData({ kind: options.kind || 'favorite', id: options.id || '' });
    return this.load();
  },
  onShow() {
    if (this._identity && this._identity !== model.scope(this)) {
      this._quizToken = null;
      this._submittedAnswers = null;
      this.setData({ questions: [], answers: [], currentQuestion: null, choices: [], result: null, review: [], error: '员工或门店已变化，请重新加载测验' });
    }
  },
  load() {
    if (this._submitting) return Promise.resolve();
    this._quizToken = null;
    this._submittedAnswers = null;
    this._identity = model.scope(this);
    return model.remote(this, () => {
      if (!this.data.id) throw new Error('缺少测验内容 ID，请从知识库重新进入');
      return this.api.action('quiz-start', { kind: this.data.kind, id: this.data.id });
    }, (data) => {
      if (!data || !data.quiz_token || !Array.isArray(data.questions)) throw new Error('测验接口未提供服务器答题凭据，暂不能开始');
      const questions = data.questions.map((question, index) => {
        if (!question.stem || !Array.isArray(question.options) || question.options.length !== 4 || question.options.some((option) => typeof option !== 'string')) {
          throw new Error('题目格式不完整，请重试');
        }
        // Never place legacy answer keys or pre-submit explanations in view data.
        return { index, stem: question.stem, options: question.options.slice() };
      });
      this._quizToken = data.quiz_token;
      this.setData({ title: data.title || '知识测验', questions, answers: questions.map(() => -1), current: 0, answered: 0 });
      this.updateQuestion();
    }, { questions: [], answers: [], currentQuestion: null, choices: [], result: null, resultNote: '', review: [], hint: '', locked: false, answered: 0 });
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
    if (this._submitting || this._submittedAnswers || this.data.result) return;
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
    if (this._submitting || this.data.result || !this._quizToken) return;
    if (this.data.answers.some((answer) => answer < 0) || !this.data.questions.length) {
      this.setData({ hint: '请完成全部题目后提交。' });
      return;
    }
    this._submitting = true;
    this.setData({ submitting: true, locked: true, hint: '' });
    if (!this._submittedAnswers) {
      this._submittedAnswers = this.data.answers.slice();
    }
    try {
      await this.run(async () => {
        if (model.scope(this) !== this._identity) throw new Error('员工登录已变化，请重新进入测验');
        const data = await this.api.action('quiz-submit', { quiz_token: this._quizToken, answers: this._submittedAnswers });
        if (model.scope(this) !== this._identity || this._gone) return;
        const result = data;
        if (!result || typeof result.score !== 'number' || typeof result.total !== 'number' || result.total <= 0 || typeof result.passed !== 'boolean' || (!this.preview && result.persisted !== true)) {
          throw new Error('服务器尚未确认评分与保存，请重试原答卷；不会本地判分。');
        }
        this.setData({
          result: { score: result.score, total: result.total, passed: result.passed, persisted: result.persisted === true },
          resultNote: this.preview ? '开发预览评分，未保存真实测验记录' : '服务器已评分并保存本次记录',
          review: (Array.isArray(result.review) ? result.review : []).map((item) => ({ stem: item.stem || '', explanation: item.explanation || '' }))
        });
      });
    } finally {
      this._submitting = false;
      if (!this._gone) this.setData({ submitting: false });
    }
  },
  retry() { return this._submittedAnswers ? this.submit() : this.load(); }
}));

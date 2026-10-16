const { definePage } = require('../../shared/page');
const model = require('../list/model');
function practiceCoordinator() { const app = typeof getApp === 'function' ? getApp() : null; return app && app.dailyPractice; }
function questionSet(data, oldToken) {
  if (!data || typeof data.quiz_token !== 'string' || !data.quiz_token.trim() || data.quiz_token === oldToken || !Array.isArray(data.questions) || !data.questions.length || data.questions.length > 20) throw new Error('测验接口未提供有效的新题目与答题凭据，请重试');
  return data.questions.map((question, index) => {
    if (!question || question.index !== index || typeof question.stem !== 'string' || !question.stem.trim() || !Array.isArray(question.options) || question.options.length !== 4 || question.options.some(option => typeof option !== 'string')) throw new Error('题目格式不完整，请重试');
    return { index, stem: question.stem, options: question.options.slice() };
  });
}

Page(definePage({
  data: { title: '知识测验', kind: 'favorite', id: '', questions: [], answers: [], current: 0, currentQuestion: null, choices: [], answered: 0, result: null, resultNote: '', review: [], reviewNote: '', submitting: false, locked: false, hint: '', starting: false, confirming: false, expired: false, canRetake: false, canRestart: false },
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
      this._confirmedAttempt = null; this._expired = false; this._completedProof = null; this._repeatPractice = null; this._questionFlight = null; this._startFlight = null; this._retakeModal = null;
      this.setData({ questions: [], answers: [], currentQuestion: null, choices: [], result: null, resultNote: '', review: [], reviewNote: '', submitting: false, locked: false, starting: false, confirming: false, expired: false, canRetake: false, canRestart: false, error: '员工或门店已变化，请重新加载测验' });
      return;
    }
    this.syncRetake();
    if (hidden && !this.data.questions.length && !this._submittedAnswers) return this.load();
  },
  onHide() { this._epoch = (this._epoch || 0) + 1; this._questionFlight = null; this._startFlight = null; this._retakeModal = null; model.hideLearning(this); this.setData({ starting: false, confirming: false, canRetake: false, canRestart: false }); },
  onUnload() { this.onHide(); this._gone = true; this._quizToken = null; this._submittedAnswers = null; this._confirmedAttempt = null; this._completedProof = null; this._repeatPractice = null; },
  load() {
    if (this._hidden || this._gone || this._submitting || this._startFlight || this._retakeModal || this._submittedAnswers || this.data.result || this._expired) return Promise.resolve();
    if (this._questionFlight) return this._questionFlight.promise;
    const flight = {}; this._questionFlight = flight;
    this._quizToken = null;
    this._submittedAnswers = null;
    this._attemptPractice = null;
    this._practiceRecorded = false;
    this.setData({ practiceCanNext: false, practiceProgressError: '' });
    this._identity = model.scope(this);
    flight.promise = model.remote(this, () => {
      if (!this.data.id) throw new Error('缺少测验内容 ID，请从知识库重新进入');
      if (this._practiceRequested && (this.data.kind !== 'favorite' || !practiceCoordinator() || !practiceCoordinator().matches(this.data.id))) throw new Error('本轮连续练习条目已变化，请返回清单核对');
      if (['official', 'favorite', 'knowledge'].indexOf(this.data.kind) < 0) throw new Error('测验来源不支持，请返回知识库');
      return this.api.action('quiz-start', { kind: this.data.kind, id: this.data.id });
    }, (data) => {
      const questions = questionSet(data);
      this._quizToken = data.quiz_token;
      this.setData({ title: data.title || '知识测验', questions, answers: questions.map(() => -1), current: 0, answered: 0 });
      this.updateQuestion();
    }, { questions: [], answers: [], currentQuestion: null, choices: [], result: null, resultNote: '', review: [], reviewNote: '', hint: '', locked: false, answered: 0 }).finally(() => { if (this._questionFlight === flight) this._questionFlight = null; });
    return flight.promise;
  },
  repeatCurrent(proof) {
    if (!proof || practiceCoordinator() !== proof.helper) return false;
    try { const view = proof.helper.view(); return proof.helper.stamp() === proof.stamp && view.index === proof.index && view.current && view.current.id === this.data.id && view.current.state === 'completed'; }
    catch (_) { return false; }
  },
  startAllowed(mode) {
    if (this._hidden || this._gone || this._submitting || this._startFlight || this._retakeModal || !this._quizToken || this._identity !== model.scope(this)) return false;
    if (mode === 'retake' ? !(this.data.result && this._confirmedAttempt && this._confirmedAttempt.token === this._quizToken) : !(this._expired && !this.data.result)) return false;
    if (!this._practiceRequested) return true;
    if (mode === 'retake') return !!this.repeatCurrent(this._completedProof);
    const helper = practiceCoordinator(); return !!(helper && (helper.matches(this.data.id) || this.repeatCurrent(this._repeatPractice)));
  },
  syncRetake() { this.setData({ canRetake: !!this.startAllowed('retake'), canRestart: !!this.startAllowed('restart') }); },
  sameStart(c) {
    if (this._hidden || this._gone || this._epoch !== c.epoch || model.scope(this) !== c.identity || this._quizToken !== c.token || this._confirmedAttempt !== c.confirmed || this._submittedAnswers !== c.answers) return false;
    if (!c.practice) return true;
    try { const p = c.practice, view = p.helper.view(); return practiceCoordinator() === p.helper && p.helper.stamp() === p.stamp && view.index === p.index && view.current && view.current.id === this.data.id && view.current.state === p.state; }
    catch (_) { return false; }
  },
  retake() { return this.confirmStart('retake'); },
  restart() { return this.confirmStart('restart'); },
  async confirmStart(mode) {
    if (!this.startAllowed(mode)) return;
    const helper = this._practiceRequested && practiceCoordinator(), view = helper && helper.view();
    const c = { epoch: this._epoch, identity: this._identity, token: this._quizToken, confirmed: this._confirmedAttempt, answers: this._submittedAnswers,
      practice: helper ? { helper, stamp: helper.stamp(), index: view.index, state: view.current.state } : null };
    this._retakeModal = c; this.setData({ confirming: true, canRetake: false, canRestart: false });
    let confirmed = false;
    try { const r = await new Promise((resolve, reject) => wx.showModal({ title: mode === 'retake' ? '再练一次这条知识？' : '重新开始测验？', content: mode === 'retake' ? '将获取一份新的答卷，不清除既有成绩，也不会强制重建题库。' : '服务器已明确确认首次提交的答卷过期。确认后获取新答卷，不会提交旧答案。', success: resolve, fail: reject })); confirmed = r.confirm === true; }
    catch (_) { /* Cancellation keeps the original attempt. */ }
    finally { if (this._retakeModal === c) { this._retakeModal = null; if (!this._hidden && !this._gone && this._epoch === c.epoch && model.scope(this) === c.identity) { this.setData({ confirming: false }); this.syncRetake(); } } }
    if (!confirmed || !this.sameStart(c) || !this.startAllowed(mode)) return;
    this._startFlight = c; this.setData({ starting: true, error: '', canRetake: false, canRestart: false, practiceCanNext: false });
    try {
      const data = await this.api.action('quiz-start', { kind: this.data.kind, id: this.data.id });
      if (!this.sameStart(c)) return;
      const questions = questionSet(data, c.token);
      // Commit the new attempt only after the entire response and old context validate.
      this._quizToken = data.quiz_token; this._submittedAnswers = null; this._confirmedAttempt = null; this._expired = false;
      this._repeatPractice = c.practice && c.practice.state === 'completed' ? { ...c.practice } : null;
      this._attemptPractice = null; this._practiceRecorded = false;
      this.setData({ title: typeof data.title === 'string' && data.title || this.data.title, questions, answers: questions.map(() => -1), current: 0, answered: 0, result: null, resultNote: '', review: [], reviewNote: '', expired: false, locked: false, hint: '', error: '', practiceProgressError: '' });
      this.updateQuestion(); this.syncPractice();
    } catch (e) { if (this.sameStart(c)) await this.run(async () => { throw e; }, { silent: true }); }
    finally { if (this._startFlight === c) { this._startFlight = null; if (!this._hidden && !this._gone && this._epoch === c.epoch && model.scope(this) === c.identity) { this.setData({ starting: false }); this.syncPractice(); this.syncRetake(); } } }
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
    if (this._hidden || this._gone || this._submitting || this._startFlight || this._retakeModal || this._expired || this.data.result || !this._quizToken) return;
    if (this._practiceRequested && !this._submittedAnswers && (!practiceCoordinator() || !practiceCoordinator().matches(this.data.id)) && !this.repeatCurrent(this._repeatPractice)) { this.setData({ error: '本轮连续练习已变化，请返回清单核对；不会自动推进。' }); return; }
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
    const firstSubmit = !this._submittedAnswers;
    if (firstSubmit) {
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
        catch (error) { if (active()) { if (firstSubmit && error.status === 410 && error.code === 'quiz_expired') { this._expired = true; this.setData({ expired: true }); } throw error; } return; }
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
        this._confirmedAttempt = { token: this._quizToken };
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
        if (!this._gone && !this._hidden && model.scope(this) === identity) { this.setData({ submitting: false }); this.syncRetake(); }
      }
    }
  },
  recordPractice(receipt, context) {
    if (!context || context.helper !== practiceCoordinator()) return;
    try {
      context.helper.recordAttempt(this.data.id, receipt, context.stamp);
      this._practiceRecorded = true;
      const view = context.helper.view();
      if (this._practiceRequested && view.current && view.current.id === this.data.id && view.current.state === 'completed') this._completedProof = { helper: context.helper, stamp: context.stamp, index: view.index };
      this.syncPractice();
      this.setData({ practiceProgressError: context.helper.view().progressError || '' });
    } catch (error) { this.setData({ practiceProgressError: '本机练习进度未确认：' + error.message + '。以上服务器评分与保存回执不受影响。', practiceCanNext: false }); }
  },
  syncPractice() {
    const helper = practiceCoordinator(), view = helper && helper.view();
    const current = view && view.current;
    const valid = this._practiceRequested && this.data.kind === 'favorite' && current && current.id === this.data.id && (helper.matches(this.data.id) || this.repeatCurrent(this._repeatPractice) || (this._practiceRecorded && current.state === 'completed'));
    this.setData({ practiceMode: !!valid, practiceCanNext: !!(valid && this._practiceRecorded && this.data.result && current.state === 'completed'), practiceNote: this._practiceRequested ? (valid ? '本轮 ' + (view.index + 1) + ' / ' + view.queue.length + ' · 完整作答后再进入下一条。' : '本轮条目已变化或失效，请返回清单核对。') : '' });
  },
  nextPractice() {
    if (!this._practiceRequested || !this._practiceRecorded || !this.data.result || this._hidden || this._gone || this._submitting || this._startFlight || this._retakeModal || this._practiceRedirecting || this._identity !== model.scope(this)) return;
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
    if (!this._practiceRequested || this._hidden || this._gone || this._submitting || this._startFlight || this._retakeModal || this._practiceRedirecting || this._identity !== model.scope(this)) return;
    if (!this._submittedAnswers || this.data.result) return this.redirectPractice('/pages/practice/index');
    const identity = this._identity, epoch = this._epoch;
    wx.showModal({ title: '离开尚未确认的答卷？', content: '未获服务器保存确认，不计入本轮已练。原答卷仅能在当前页重试，返回清单不会自动提交或推进。', success: (result) => {
      if (result.confirm && !this._hidden && !this._gone && identity === model.scope(this) && epoch === this._epoch) this.redirectPractice('/pages/practice/index');
    } });
  },
  retry() { return this._submittedAnswers ? this.submit() : this.load(); }
}));

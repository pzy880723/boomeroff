const tabs = [
  { id: 'knowledge', label: '知识' }, { id: 'training', label: '培训' },
  { id: 'quiz', label: '测试' }, { id: 'records', label: '记录' }, { id: 'favorites', label: '收藏' }
];

function key(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('内容编号无效');
  return id;
}

function makeLearningClient(call) {
  const card = id => '/learning/cards/' + key(id);
  const draft = id => '/learning/drafts/' + key(id);
  return {
    async list(tab, { q = '', category = '', sort = 'latest', page = 1, recordKind = 'all' } = {}) {
      if (!tabs.some(t => t.id === tab)) throw new Error('学习分类不存在');
      return call('/learning?' + Object.entries({ tab, q, category, sort, page, record_kind:recordKind })
        .map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
    },
    async detail(id) { return call(card(id)); },
    async favorite(id, selected) { return call(card(id) + '/favorite', { selected }); },
    async completeTraining(id) { return call(card(id) + '/complete-training', {}); },
    async start(id) { return call(card(id) + '/start', {}); },
    async submit(id, answers) { return call('/learning/attempts/' + key(id), { answers }); },
    async generate(input) { return call('/learning/drafts', input); },
    async draft(id) { return call(draft(id)); },
    async retry(id, requestId) { return call(draft(id) + '/retry', { request_id:requestId }); },
    async save(id, fields) { return call(draft(id) + '/save', fields, undefined); },
    async attach(id, data, mime) { return call(draft(id) + '/photo', data, mime); },
    async clearPhoto(id) { return call(draft(id) + '/clear-photo', {}); },
    async cover(id) { return call('/learning/covers/' + key(id), undefined, undefined, true); }
  };
}

module.exports = { makeLearningClient, tabs };

const { definePage } = require('../../shared/page');
const model = require('../list/model');
const pad = (number) => String(number).padStart(2, '0');

Page(definePage({
  data: { month: '', days: [], items: [], visibleItems: [], selectedDate: '', weekdays: ['一', '二', '三', '四', '五', '六', '日'], freshness: '' },
  onLoad(options) {
    const now = new Date();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(options.month || '') ? options.month : now.getFullYear() + '-' + pad(now.getMonth() + 1);
    this.setData({ month });
    return this.load();
  },
  onShow() { if (this._request && this._identity !== model.scope(this)) return this.load(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const month = this.data.month;
    this._identity = model.scope(this);
    this.buildDays([]);
    return model.remote(this, () => this.api.action('schedule', { month }), (data) => {
      const raw = data && (data.items || data.schedules);
      if (!Array.isArray(raw)) throw new Error('排班接口未返回月排班列表，请重试');
      const defs = Array.isArray(data.shift_defs) ? data.shift_defs : [];
      const entries = raw.map((entry) => {
        const shift = defs.find((def) => def.code === entry.shift_code && def.shop_id === entry.shop_id) || {};
        return {
          id: String(entry.id), date: String(entry.date || entry.work_date || '').slice(0, 10),
          title: entry.title || shift.name || entry.shift_code || '已排班',
          start: entry.start_time || shift.start_time || '', end: entry.end_time || shift.end_time || '',
          shop: entry.shop_name || '', note: entry.note || ''
        };
      }).filter((entry) => entry.date.slice(0, 7) === month).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      this.setData({ items: entries, visibleItems: this.data.selectedDate ? entries.filter((entry) => entry.date === this.data.selectedDate) : entries, freshness: model.freshness(data) });
      this.buildDays(entries);
    }, { items: [], visibleItems: [], freshness: '' });
  },
  buildDays(entries) {
    const parts = this.data.month.split('-').map(Number);
    const offset = (new Date(parts[0], parts[1] - 1, 1).getDay() + 6) % 7;
    const count = new Date(parts[0], parts[1], 0).getDate();
    const days = [];
    for (let index = 0; index < offset; index++) days.push({ key: 'blank-' + index, date: '', day: '', shifts: [] });
    for (let day = 1; day <= count; day++) {
      const date = this.data.month + '-' + pad(day);
      days.push({ key: date, date, day, selected: date === this.data.selectedDate, shifts: entries.filter((entry) => entry.date === date).map((entry) => entry.title) });
    }
    this.setData({ days });
  },
  onMonthChange(event) {
    const month = String(event.detail.value).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    this.setData({ month, selectedDate: '' });
    return this.load();
  },
  previousMonth() { return this.changeMonth(-1); },
  nextMonth() { return this.changeMonth(1); },
  changeMonth(delta) {
    const parts = this.data.month.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1 + delta, 1);
    return this.onMonthChange({ detail: { value: date.getFullYear() + '-' + pad(date.getMonth() + 1) } });
  },
  selectDay(event) {
    const date = event.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date, visibleItems: this.data.items.filter((entry) => entry.date === date) });
    this.buildDays(this.data.items);
  },
  showMonth() { this.setData({ selectedDate: '', visibleItems: this.data.items }); this.buildDays(this.data.items); },
  retry() { return this.load(); }
}));

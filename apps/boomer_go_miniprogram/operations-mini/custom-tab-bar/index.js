Component({
  data: {
    selected: 0,
    items: [
      { name: '工作台', path: 'pages/workbench/index', icon: 'home' },
      { name: '学习', path: 'pages/learning/index', icon: 'book' },
      { name: '竞赛', path: 'pages/competition/index', icon: 'cup' },
      { name: '消息', path: 'pages/messages/index', icon: 'chat' },
      { name: '我的', path: 'pages/me/index', icon: 'person' }
    ]
  },
  lifetimes: { attached() { this.sync(); } },
  pageLifetimes: { show() { this.sync(); } },
  methods: {
    sync() {
      const pages = getCurrentPages();
      const route = pages[pages.length - 1]?.route;
      const index = this.data.items.findIndex(item => item.path === route);
      if (index !== -1) this.setData({ selected: index });
    },
    open(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.items[index];
      if (!item) return;
      this.setData({ selected: index });
      wx.switchTab({ url: '/' + item.path, fail: () => this.sync() });
    }
  }
});

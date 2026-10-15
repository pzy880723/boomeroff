const { definePage } = require('../../shared/page');
const model = require('../list/model');

Page(definePage({
  data: {
    profile: null, shops: [], shopIndex: 0, isHeadquarters: false, freshness: '', signingOut: false,
    groups: [
      { title: '我的工作', entries: [
        { label: '我的排班', icon: '班', url: '/pages/schedule/index' },
        { label: '每日任务', icon: '待', url: '/pages/list/index?kind=tasks' },
        { label: '门店 OKR', icon: 'O', url: '/pages/list/index?kind=objectives' },
        { label: '成长签到', icon: '签', url: '/pages/list/index?kind=check-ins' }
      ] },
      { title: '知识与成长', entries: [
        { label: '我的知识库', icon: '知', url: '/pages/list/index?kind=my-library' },
        { label: '我的收藏', icon: '藏', url: '/pages/list/index?kind=favorites' },
        { label: '识物记录', icon: '识', url: '/pages/list/index?kind=history' },
        { label: '知识测验记录', icon: '测', url: '/pages/list/index?kind=quiz-history' },
        { label: '门店 SOP', icon: 'S', url: '/pages/list/index?kind=sop' },
        { label: '门店问答', icon: 'Q', url: '/pages/list/index?kind=qa' }
      ] },
      { title: '协作与服务', entries: [
        { label: 'BOOMER 圈', icon: '圈', url: '/pages/list/index?kind=community' },
        { label: '我的活动', icon: '约', url: '/pages/list/index?kind=activities' },
        { label: '门店优惠券', icon: '券', url: '/pages/list/index?kind=vouchers' },
        { label: '营销工作台', icon: 'M', url: '/pages/marketing/index' },
        { label: 'AI 助手', icon: 'AI', url: '/pages/assistant/index' },
        { label: '个人资料', icon: '人', url: '/pages/detail/index?kind=profile' },
        { label: '设置与帮助', icon: '设', url: '/pages/detail/index?kind=settings' }
      ] }
    ]
  },
  onLoad() { return this.load(); },
  onShow() { if (this._request) return this.load(); },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  load() {
    const session = this.session.get();
    const shops = session && session.isHeadquarters ? (session.shops || []).map((shop) => ({ id: shop.id, name: shop.name })) : [];
    this.setData({ shops, isHeadquarters: !!(session && session.isHeadquarters), shopIndex: Math.max(0, shops.findIndex((shop) => session.shop && shop.id === session.shop.id)) });
    return model.remote(this, () => this.api.action('profile', {}), (data) => {
      if (!data || !data.profile) throw new Error('个人资料接口未返回员工资料，请重试');
      const staff = data.staff || {};
      const profile = data.profile;
      const name = staff.real_name || profile.display_name || (session && session.profile.display_name) || '员工';
      const experience = data.experience || {};
      this.setData({ profile: {
        name, initial: name.slice(0, 1), avatar: profile.avatar_url || '',
        shop: session && session.shop ? session.shop.name : '暂无已验证工作门店',
        role: typeof data.role === 'string' ? data.role : (data.role && data.role.name) || staff.position || '员工',
        experience: typeof experience.total_exp === 'number' ? String(experience.total_exp) : '暂无数据'
      }, freshness: model.freshness(data) });
    }, { profile: null, freshness: '' });
  },
  onShopChange(event) {
    return this.run(async () => {
      const session = this.session.get();
      const shop = this.data.shops[Number(event.detail.value)];
      if (!session || !session.isHeadquarters || !shop) throw new Error('当前账号不可切换门店');
      this.session.selectShop(shop.id);
      await this.load();
    });
  },
  logout() {
    if (this.data.signingOut) return;
    wx.showModal({
      title: this.preview ? '退出开发预览' : '退出员工账号',
      content: '退出后会清除本机登录状态，员工数据不会保留在页面。',
      confirmText: '退出', confirmColor: '#EB0029',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ signingOut: true });
        this._request = (this._request || 0) + 1;
        if (this.preview) getApp().leavePreview(); else this.session.signOut();
        this.setData({ profile: null, shops: [], isHeadquarters: false, freshness: '', signingOut: false });
        wx.reLaunch({ url: '/pages/login/index' });
      }
    });
  },
  retry() { return this.load(); }
}));

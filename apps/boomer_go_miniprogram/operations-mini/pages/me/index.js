Page({
  data: { shops: [], role: '' },
  onShow() {
    const scope = getApp().operations.current();
    if (!scope) return wx.reLaunch({ url: '/pages/login/index' });
    this.setData({ shops: scope.shops, role: scope.hq ? '总部账号' : scope.canManage ? '店长账号' : '员工账号' });
  },
  signOut() {
    getApp().operations.signOut();
    wx.reLaunch({ url: '/pages/login/index' });
  }
});

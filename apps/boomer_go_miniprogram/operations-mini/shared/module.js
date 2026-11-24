function modulePage() {
  Page({
    data: { authorized: false },
    onShow() {
      if (!getApp().operations.current()) return wx.reLaunch({ url: '/pages/login/index' });
      this.setData({ authorized: true });
    }
  });
}
module.exports = { modulePage };

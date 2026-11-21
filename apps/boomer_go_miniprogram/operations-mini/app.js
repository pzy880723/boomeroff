const { createErpAuth } = require('./shared/erp-auth');
const { createOperations } = require('./shared/operations');

App({
  onLaunch() {
    const key = 'boomer-go.operations.install';
    let installId;
    try { installId = wx.getStorageSync(key); } catch (_) {}
    if (typeof installId !== 'string' || !/^go_[a-z0-9]{8,60}$/.test(installId)) {
      installId = 'go_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      try { wx.setStorageSync(key, installId); } catch (_) {}
    }
    this.operations = createOperations({ wx, auth: createErpAuth({ wx, installId }) });
  }
});

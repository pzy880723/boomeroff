const { createErpAuth } = require('./shared/erp-auth');
const { createOperations } = require('./shared/operations');

App({
  onLaunch() {
    if (wx.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      const fs = wx.getFileSystemManager();
      const directory = wx.env.USER_DATA_PATH;
      fs.readdir({ dirPath: directory, fail() {}, success({ files }) {
        for (const name of files) {
          if (/^go-proof-[a-f0-9]{32}\.(jpeg|png|webp)$/.test(name)) fs.unlink({ filePath: directory + '/' + name, fail() {} });
        }
      } });
    }
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

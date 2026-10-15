const { definePage } = require('../../shared/page');
const { scopeKey } = require('../marketing/model');

Page(definePage({
  data: { photos: [], hint: '', cameraActive: false, cameraReady: false, cameraError: '', result: null, sellingPoints: [], savedId: '', notice: '' },
  onLoad() { this._disposed = false; this._capturing = false; this._scope = scopeKey(this.session); },
  onShow() {
    const scope = scopeKey(this.session);
    if (this._scope !== scope) this.setData({ photos: [], hint: '', result: null, sellingPoints: [], savedId: '', notice: '', error: '' });
    this._scope = scope;
    this.setData({ cameraActive: true });
  },
  onHide() { this.setData({ cameraActive: false, cameraReady: false }); },
  onUnload() { this._disposed = true; },
  cameraReady() { this._camera = wx.createCameraContext(); this.setData({ cameraReady: true, cameraError: '' }); },
  cameraError(event) { this.setData({ cameraReady: false, cameraError: event.detail.errMsg || '相机暂不可用，请检查微信相机权限，或从相册添加' }); },
  hintInput(event) { this.setData({ hint: event.detail.value }); },
  takePhoto() {
    if (this._capturing || this.data.loading || this.data.photos.length >= 5 || !this.data.cameraReady) return;
    const scope = scopeKey(this.session);
    this._capturing = true;
    return this.run(async () => {
      try {
        await new Promise((resolve, reject) => {
          (this._camera || wx.createCameraContext()).takePhoto({ quality: 'high',
            success: result => {
              if (!this._disposed && scope === scopeKey(this.session) && result.tempImagePath) {
                this.setData({ photos: this.data.photos.concat(result.tempImagePath).slice(0, 5), result: null, sellingPoints: [], savedId: '', notice: '' });
              }
              resolve();
            }, fail: () => reject(new Error('相机拍摄失败，已有照片已保留，请重试或从相册添加')),
          });
        });
      } finally { this._capturing = false; }
    });
  },
  pickAlbum() {
    if (this.data.loading || this._capturing || this.data.photos.length >= 5) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      const files = await new Promise((resolve, reject) => wx.chooseMedia({
        count: 5 - this.data.photos.length, mediaType: ['image'], sourceType: ['album'],
        success: result => resolve(result.tempFiles || []),
        fail: error => /cancel/i.test(error.errMsg || '') ? resolve([]) : reject(new Error('相册读取失败，已有照片已保留')),
      }));
      if (this._disposed || scope !== scopeKey(this.session) || !files.length) return;
      const paths = files.map(file => file.tempFilePath).filter(Boolean);
      this.setData({ photos: this.data.photos.concat(paths).slice(0, 5), result: null, sellingPoints: [], savedId: '', notice: '' });
    });
  },
  removePhoto(event) {
    if (this.data.loading || this._capturing) return;
    this.setData({ photos: this.data.photos.filter((_, index) => index !== Number(event.currentTarget.dataset.index)), result: null, savedId: '', notice: '' });
  },
  previewPhoto(event) { wx.previewImage({ current: this.data.photos[Number(event.currentTarget.dataset.index)], urls: this.data.photos }); },
  recognize() {
    if (this.data.loading || this._capturing) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.photos.length) throw new Error('请先拍摄或选择 1 至 5 张商品照片');
      this.setData({ result: null, sellingPoints: [], savedId: '', notice: '' });
      const result = await this.api.recognize(this.data.photos.slice(), this.data.hint.trim());
      if (this._disposed || scope !== scopeKey(this.session)) return;
      if (!result || result.error || typeof result.name !== 'string' || !result.name.trim()) throw new Error('识别信息不完整，照片已保留，请补充整体或底款后重试');
      const sellingPoints = (Array.isArray(result.sellingPoints) ? result.sellingPoints : [])
        .map(point => typeof point === 'string' ? point : point && point.text).filter(point => typeof point === 'string' && point.trim());
      this.setData({ result, sellingPoints });
    });
  },
  saveResult() {
    if (this.data.loading || this.data.savedId) return;
    const scope = scopeKey(this.session);
    return this.run(async () => {
      if (!this.data.result) throw new Error('请先完成识别');
      const result = this.data.result;
      const response = await this.api.action('recognition-save', { result, photos: this.data.photos.slice() });
      if (this._disposed || scope !== scopeKey(this.session) || result !== this.data.result) return;
      if (!response || response.error || response.ok === false || response.persisted === false || !response.item || typeof response.item.id !== 'string' || !response.item.id.trim()) throw new Error('尚未确认云端保存，照片和识别结果已保留，请稍后重试');
      this.setData({ savedId: response.item.id, notice: '已保存到云端识物记录' });
    });
  },
  retry() { return this.recognize(); },
}));

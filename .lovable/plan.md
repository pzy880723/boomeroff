## 目标

把当前 React + Vite 项目接入 Capacitor，让你可以导出到 GitHub 后在本地（或 Workbuddy 之类的工具）一键打包成 iOS / Android 原生 APP。Lovable 端只负责"集成 + 配置 + 文档"，不动业务代码、不动现有 UI。

## 要做的事

### 1. 安装 Capacitor 依赖
- `@capacitor/core`
- `@capacitor/cli`（dev 依赖）
- `@capacitor/ios`
- `@capacitor/android`

### 2. 创建 `capacitor.config.ts`
配置如下：
- `appId`: `app.lovable.bef32724503e467aaf032062176cf921`
- `appName`: `boomeroff`
- `webDir`: `dist`
- `server.url`: 指向 Lovable 沙箱预览 URL，开启 **热重载**（你在 Lovable 里改 UI，手机 APP 实时刷新，不用重新打包）
- `server.cleartext`: `true`

### 3. 新建 `docs/capacitor-setup.md` 启动手册
中文版操作清单，复制粘贴就能跑：
- 导出到 GitHub → `git pull` → `npm install`
- `npx cap add ios` / `npx cap add android`
- `npm run build && npx cap sync`
- `npx cap run ios` / `npx cap run android`
- 常见坑：iOS 必须 Mac + Xcode + 苹果开发者账号 $99/年；Android 装 Android Studio + Google Play $25 一次性
- 上架前要把 `server.url` 注释掉重新打包（不然 APP 永远从 Lovable 沙箱加载，沙箱关掉就白屏）

### 4. 暂不做的事（等你确认需求再加）
- ❌ 不装相机 / 推送 / 相册插件 —— 等你说"我要做扫码 / 推送营销消息"再装对应 Capacitor 插件
- ❌ 不改任何现有页面或业务逻辑
- ❌ 不动 PWA manifest（如果你以后想 PWA + 原生双轨，再说）

## 你拿到后要做什么

1. 点右上角 **GitHub** 导出项目
2. `git pull` 到本地
3. 按 `docs/capacitor-setup.md` 一步步跑
4. 第一次出包成功后回来告诉我，需要哪些原生能力（推送 / 相机 / 生物识别 / 分享…），我再加插件
5. 同时建议读一遍官方博客把坑提前过一遍：https://lovable.dev/blog/2025-02-21-capacitor-guide

## 技术细节

- 不引入 `vite-plugin-pwa`、Workbox、Service Worker（与 Capacitor 冲突且当前不需要）
- 不改 `vite.config.ts` 的 `base` —— Capacitor 走 `webDir: dist` + 服务端热重载 URL，不需要相对路径
- `capacitor.config.ts` 用 TS 版本（项目本身就是 TS）
- `package.json` 不加 `"main"` 字段（Capacitor 不需要，那个是 Electron 才需要的）

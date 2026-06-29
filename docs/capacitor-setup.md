# Capacitor 启动手册（BOOMER-OFF）

把 Lovable 里的项目打包成可以装到手机、可以上架 App Store / Google Play 的原生 APP。

---

## 一、本地环境准备（第一次跑要装）

| 平台 | 必需 |
|------|------|
| **iOS** | macOS 电脑 + [Xcode](https://apps.apple.com/cn/app/xcode/id497799835)（App Store 免费下，体积大）+ 苹果开发者账号（上架要 $99/年，仅本地调试可免） |
| **Android** | [Android Studio](https://developer.android.com/studio)（Windows / Mac / Linux 都行）+ Google Play 开发者账号（上架要 $25 一次性） |
| **通用** | Node 20+、Git |

---

## 二、首次出包流程

```bash
# 1. 把 Lovable 项目导出到你自己的 GitHub（Lovable 右上角 → GitHub → Connect）
# 2. 克隆到本地
git clone <你的 github 仓库地址>
cd <仓库名>

# 3. 装依赖
npm install

# 4. 添加原生平台（按需选）
npx cap add ios
npx cap add android

# 5. 构建 Web 产物 + 同步到原生工程
npm run build
npx cap sync

# 6. 跑起来（连真机或模拟器）
npx cap run ios       # 需要 Mac + Xcode
npx cap run android   # 需要 Android Studio
```

第一次 `cap add` 之后，项目根目录会多出 `ios/` 和 `android/` 两个文件夹 —— **这两个文件夹要提交到 Git**，里面有你的签名配置、图标、启动屏。

---

## 三、日常开发：热重载（爽点）

`capacitor.config.ts` 里已经配好了 `server.url` 指向 Lovable 沙箱，所以：

- 你在 Lovable 里改 UI → 保存 → **手机 APP 里实时刷新**，不用重新打包
- 适合调界面、测交互

---

## 四、后续每次 `git pull` 之后

```bash
npm install        # 万一有新依赖
npm run build
npx cap sync       # 把 web 产物 + 新插件同步到 ios/ 和 android/
```

---

## 五、上架前的关键一步（⚠️ 别忘）

热重载模式下 APP 永远从 Lovable 沙箱加载内容。**上架前必须切回离线模式**，不然沙箱关掉 APP 就白屏。

打开 `capacitor.config.ts`，把 `server` 整段**注释掉或删掉**：

```ts
const config: CapacitorConfig = {
  appId: 'app.lovable.bef32724503e467aaf032062176cf921',
  appName: 'boomeroff',
  webDir: 'dist',
  // server: { url: '...', cleartext: true },  ← 注释掉
};
```

然后重新打包：

```bash
npm run build
npx cap sync
npx cap open ios      # 在 Xcode 里 Archive 出 .ipa
npx cap open android  # 在 Android Studio 里 Build → Generate Signed Bundle 出 .aab
```

---

## 六、想加原生能力？回 Lovable 告诉我

目前**只装了 Capacitor 核心**，没有相机、推送、相册、生物识别等插件。需要哪个，告诉我一声，我装好 + 写好调用代码，你这边只要再跑一次 `npm install && npx cap sync` 就生效。

常用插件预览：

| 想做什么 | 插件 |
|---------|------|
| 扫码 / 拍照 | `@capacitor/camera` |
| 推送营销消息 | `@capacitor/push-notifications` + Firebase |
| 读相册图片 | `@capacitor/filesystem` |
| 指纹 / Face ID 登录 | `@capacitor-community/biometric-auth` |
| 分享到微信 / 系统分享面板 | `@capacitor/share` |
| 应用内打开网页 | `@capacitor/browser` |

---

## 七、推荐读一遍官方博客

https://lovable.dev/blog/2025-02-21-capacitor-guide

里面把签名、图标、启动屏、上架审核的坑都过了一遍。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('两个 AI 识图入口优先启动网页连续取景，原生相机仅作为兜底', () => {
  const cameraStage = read('src/components/recognition/CameraStage.tsx');
  const liveStream = read('src/components/dashboard/LiveStreamPanel.tsx');

  for (const source of [cameraStage, liveStream]) {
    const startCamera = source.slice(source.indexOf('const startCamera'));
    assert.ok(startCamera.indexOf('getUserMedia') < startCamera.indexOf('captureNativePhoto'));
    assert.match(source, /captureNativePhoto/);
    assert.match(source, /NativeCameraUpdateRequired/);
    assert.match(source, /await captureNativePhoto\(targetMode\)/);
    assert.match(source, /width: \{ ideal: 1280 \}/);
  }
});

test('原生相机桥接返回文件 URI，避免大图 Base64 穿过 WebView', () => {
  const nativeCamera = read('src/lib/nativeCamera.ts');

  assert.match(nativeCamera, /MIN_NATIVE_CAMERA_BUILD = 2/);
  assert.match(nativeCamera, /Capacitor\.isNativePlatform\(\)/);
  assert.match(nativeCamera, /Capacitor\.isPluginAvailable\('Camera'\)/);
  assert.match(nativeCamera, /Camera\.getPhoto/);
  assert.match(nativeCamera, /CameraResultType\.Uri/);
  assert.match(nativeCamera, /photo\.webPath/);
  assert.match(nativeCamera, /Capacitor\.convertFileSrc\(photo\.path\)/);
  assert.doesNotMatch(nativeCamera, /CameraResultType\.DataUrl/);
  assert.match(nativeCamera, /CameraSource\.Camera/);
});

test('图片压缩失败或超时会明确结束，不再无限转圈', () => {
  const cameraImage = read('src/lib/cameraImage.ts');

  assert.match(cameraImage, /img\.onerror/);
  assert.match(cameraImage, /setTimeout/);
  assert.match(cameraImage, /reject\(/);
});

test('识图网络请求有总超时，弱网不会永远停在加载状态', () => {
  const recognition = read('src/hooks/useProductRecognition.tsx');

  assert.match(recognition, /RECOGNITION_TIMEOUT_MS = 25_000/);
  assert.match(recognition, /Promise\.race/);
  assert.match(recognition, /识别等待超时/);
});

test('iOS 和 Android 声明摄像头权限并升级原生构建号', () => {
  const infoPlist = read('ios/App/App/Info.plist');
  const xcodeProject = read('ios/App/App.xcodeproj/project.pbxproj');
  const androidManifest = read('android/app/src/main/AndroidManifest.xml');
  const androidBuild = read('android/app/build.gradle');

  assert.match(infoPlist, /NSCameraUsageDescription/);
  assert.match(androidManifest, /android\.permission\.CAMERA/);
  assert.match(xcodeProject, /CURRENT_PROJECT_VERSION = 3;/);
  assert.match(xcodeProject, /MARKETING_VERSION = 1\.0\.2;/);
  assert.match(androidBuild, /versionCode 3/);
  assert.match(androidBuild, /versionName "1\.0\.2"/);
});

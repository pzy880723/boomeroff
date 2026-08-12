import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('两个 AI 识图入口在 BOOMER GO 中优先调用原生相机', () => {
  const cameraStage = read('src/components/recognition/CameraStage.tsx');
  const liveStream = read('src/components/dashboard/LiveStreamPanel.tsx');

  for (const source of [cameraStage, liveStream]) {
    assert.match(source, /captureNativePhoto/);
    assert.match(source, /NativeCameraUpdateRequired/);
    assert.match(source, /await captureNativePhoto\(targetMode\)/);
  }
});

test('原生相机桥接仅允许新版 App 调用并返回图片 data URL', () => {
  const nativeCamera = read('src/lib/nativeCamera.ts');

  assert.match(nativeCamera, /MIN_NATIVE_CAMERA_BUILD = 2/);
  assert.match(nativeCamera, /Capacitor\.isNativePlatform\(\)/);
  assert.match(nativeCamera, /Capacitor\.isPluginAvailable\('Camera'\)/);
  assert.match(nativeCamera, /Camera\.getPhoto/);
  assert.match(nativeCamera, /CameraResultType\.DataUrl/);
  assert.match(nativeCamera, /CameraSource\.Camera/);
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

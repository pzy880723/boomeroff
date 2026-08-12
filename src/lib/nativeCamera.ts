import { App } from '@capacitor/app';
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

const MIN_NATIVE_CAMERA_BUILD = 2;

export class NativeCameraUpdateRequired extends Error {
  constructor() {
    super('请更新 BOOMER GO 后再使用拍照识图');
    this.name = 'NativeCameraUpdateRequired';
  }
}

export function isNativeCameraRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera');
}

export function isNativeCameraCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; message?: string };
  return value.code === 'OS-PLUG-CAMR-0006'
    || /cancelled|canceled|取消/i.test(value.message || '');
}

export async function captureNativePhoto(
  facingMode: 'environment' | 'user' = 'environment',
): Promise<string | null> {
  if (!isNativeCameraRuntime()) return null;

  const appInfo = await App.getInfo();
  const build = Number.parseInt(appInfo.build, 10);
  if (!Number.isFinite(build) || build < MIN_NATIVE_CAMERA_BUILD) {
    throw new NativeCameraUpdateRequired();
  }

  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    direction: facingMode === 'user' ? CameraDirection.Front : CameraDirection.Rear,
    resultType: CameraResultType.DataUrl,
    quality: 90,
    correctOrientation: true,
    saveToGallery: false,
    allowEditing: false,
  });

  return photo.dataUrl || null;
}

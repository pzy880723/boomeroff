export type ImageOrientation = 'portrait' | 'landscape' | 'square' | 'unknown';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageAssetLike {
  output_url?: unknown;
  meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function imageDimensionsFromMeta(meta: Record<string, unknown> | null | undefined): ImageDimensions | null {
  const source = meta || {};
  const nested = source.image_dimensions && typeof source.image_dimensions === 'object'
    ? source.image_dimensions as Record<string, unknown>
    : {};
  const width = positiveInt(source.image_width ?? source.width ?? nested.width);
  const height = positiveInt(source.image_height ?? source.height ?? nested.height);
  return width && height ? { width, height } : null;
}

export function imageOrientation(width: number, height: number): ImageOrientation {
  if (!(width > 0) || !(height > 0)) return 'unknown';
  const ratio = width / height;
  if (ratio >= 0.9 && ratio <= 1.1) return 'square';
  return ratio < 1 ? 'portrait' : 'landscape';
}

export function imageOrientationFromMeta(meta: Record<string, unknown> | null | undefined): ImageOrientation {
  const dimensions = imageDimensionsFromMeta(meta);
  return dimensions ? imageOrientation(dimensions.width, dimensions.height) : 'unknown';
}

export function withImageDimensions<T extends ImageAssetLike>(asset: T, dimensions: ImageDimensions): T {
  return {
    ...asset,
    meta: {
      ...(asset.meta || {}),
      image_width: dimensions.width,
      image_height: dimensions.height,
      image_orientation: imageOrientation(dimensions.width, dimensions.height),
      image_dimensions: dimensions,
    },
  };
}

export function selectAssetsForVideoAspect<T extends ImageAssetLike>(assets: T[], aspect: string): T[] {
  const expected: ImageOrientation = aspect === '9:16'
    ? 'portrait'
    : aspect === '16:9'
      ? 'landscape'
      : 'square';
  return assets.filter((asset) => imageOrientationFromMeta(asset.meta) === expected);
}

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

export function parseImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length >= 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }

  if (bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' &&
    String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }

  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
      if (offset + 1 >= bytes.length) break;
      const length = u16(bytes, offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (sofMarkers.has(marker) && length >= 7) {
        return { height: u16(bytes, offset + 3), width: u16(bytes, offset + 5) };
      }
      offset += length;
    }
  }
  return null;
}

export async function probeImageDimensions(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<ImageDimensions | null> {
  const maxBytes = 131072;
  const response = await fetcher(url, { headers: { Range: `bytes=0-${maxBytes - 1}` } });
  if (!response.ok) return null;
  if (!response.body) return parseImageDimensions(new Uint8Array(await response.arrayBuffer()));

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const prefix = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    prefix.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return parseImageDimensions(prefix);
}

// 计算文件字节的 SHA-256，返回 64 位 hex；SubtleCrypto 不可用时降级为 size-mtime-name。
export async function fileSha256(file: File): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    }
  } catch {
    // fallthrough
  }
  return `fb-${file.size}-${file.lastModified}-${file.name}`;
}

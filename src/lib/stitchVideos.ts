// 把若干段 MP4 顺序拼接成一支 MP4（不重编码，纯 remux）。
// 用于 Seedance 多段渲染后的客户端拼接。
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

export type StitchProgress = (info: {
  stage: 'download' | 'demux' | 'remux' | 'finalize';
  segment: number;
  total: number;
}) => void;

export type StitchFetchOptions = {
  init?: RequestInit;
};

/**
 * 顺序拼接多段 MP4 为一支 MP4。所有段应使用同一编码参数（Seedance 同一模型输出一致）。
 * @returns 拼好的 MP4 Blob
 */
export async function stitchSegmentUrls(
  urls: string[],
  onProgress?: StitchProgress,
  options?: StitchFetchOptions,
): Promise<Blob> {
  if (!urls.length) throw new Error('没有可拼接的段');
  const total = urls.length;

  // 1) 下载全部段
  const blobs: Blob[] = [];
  for (let i = 0; i < urls.length; i++) {
    onProgress?.({ stage: 'download', segment: i + 1, total });
    const res = await fetch(urls[i], options?.init);
    if (!res.ok) throw new Error(`第 ${i + 1} 段下载失败 (${res.status})`);
    blobs.push(await res.blob());
  }

  // 2) 打开 Output
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  let videoSrc: EncodedVideoPacketSource | null = null;
  let audioSrc: EncodedAudioPacketSource | null = null;
  let videoMetaSent = false;
  let audioMetaSent = false;
  let started = false;

  // 时间偏移：按"上一段已写入的最后 timestamp+duration"递增
  let videoOffset = 0;
  let audioOffset = 0;

  for (let i = 0; i < blobs.length; i++) {
    onProgress?.({ stage: 'demux', segment: i + 1, total });
    const input = new Input({ source: new BlobSource(blobs[i]), formats: ALL_FORMATS });
    const vTrack = await input.getPrimaryVideoTrack();
    const aTrack = await input.getPrimaryAudioTrack();

    // 第一段：根据其 codec 初始化输出轨道
    if (i === 0) {
      if (!vTrack) throw new Error('首段没有视频轨');
      videoSrc = new EncodedVideoPacketSource(vTrack.codec);
      output.addVideoTrack(videoSrc);
      if (aTrack) {
        audioSrc = new EncodedAudioPacketSource(aTrack.codec);
        output.addAudioTrack(audioSrc);
      }
      await output.start();
      started = true;
    }

    // 视频包
    if (vTrack && videoSrc) {
      onProgress?.({ stage: 'remux', segment: i + 1, total });
      const sink = new EncodedPacketSink(vTrack);
      const decoderCfg = (await vTrack.getDecoderConfig()) || undefined;
      let lastEnd = videoOffset;
      for await (const pkt of sink.packets()) {
        const ts = pkt.timestamp + videoOffset;
        const shifted = pkt.clone({ timestamp: ts });
        const meta = !videoMetaSent && decoderCfg ? { decoderConfig: decoderCfg } : undefined;
        await videoSrc.add(shifted, meta);
        videoMetaSent = true;
        const end = ts + pkt.duration;
        if (end > lastEnd) lastEnd = end;
      }
      videoOffset = lastEnd;
    }

    // 音频包
    if (aTrack && audioSrc) {
      const sink = new EncodedPacketSink(aTrack);
      const decoderCfg = (await aTrack.getDecoderConfig()) || undefined;
      let lastEnd = audioOffset;
      for await (const pkt of sink.packets()) {
        const ts = pkt.timestamp + audioOffset;
        const shifted = pkt.clone({ timestamp: ts });
        const meta = !audioMetaSent && decoderCfg ? { decoderConfig: decoderCfg } : undefined;
        await audioSrc.add(shifted, meta);
        audioMetaSent = true;
        const end = ts + pkt.duration;
        if (end > lastEnd) lastEnd = end;
      }
      audioOffset = lastEnd;
    }

    await input.dispose?.();
  }

  if (!started) throw new Error('未能启动输出');
  onProgress?.({ stage: 'finalize', segment: total, total });
  await output.finalize();

  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('拼接失败：输出为空');
  return new Blob([buf], { type: 'video/mp4' });
}

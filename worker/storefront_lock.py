from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


class StorefrontLockError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    duration_s: float


def resolve_storefront_reference(job: dict[str, Any]) -> str | None:
    script = job.get("script") if isinstance(job.get("script"), dict) else {}
    payload = (
        script.get("__render_payload")
        if isinstance(script.get("__render_payload"), dict)
        else {}
    )
    manifest = payload.get("reference_manifest")
    if not isinstance(manifest, list):
        return None
    for item in manifest:
        if not isinstance(item, dict) or item.get("role") != "storefront":
            continue
        url = str(item.get("url") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme == "https" and parsed.netloc:
            return url
    return None


def probe_video(video: Path) -> VideoInfo:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate:format=duration",
            "-of", "json", str(video),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise StorefrontLockError((completed.stderr or "ffprobe failed")[-800:])
    try:
        payload = json.loads(completed.stdout)
        stream = payload["streams"][0]
        width = int(stream["width"])
        height = int(stream["height"])
        rate = str(stream.get("avg_frame_rate") or "25/1")
        numerator, denominator = (float(part) for part in rate.split("/", 1))
        fps = numerator / denominator if denominator else 25.0
        duration_s = float(payload["format"]["duration"])
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        raise StorefrontLockError("无法读取原视频尺寸、帧率或时长") from exc
    return VideoInfo(width=width, height=height, fps=max(1.0, fps), duration_s=duration_s)


def lock_storefront_opening(
    video: Path,
    storefront: Path,
    output: Path,
    *,
    opening_duration_s: float = 3.0,
) -> Path:
    info = probe_video(video)
    opening_duration_s = max(0.5, min(opening_duration_s, info.duration_s - 0.1))
    width = info.width - (info.width % 2)
    height = info.height - (info.height % 2)
    fps = round(info.fps, 3)
    duration = round(info.duration_s, 3)
    filter_graph = (
        f"[0:v]split=2[bgsrc][fgsrc];"
        f"[bgsrc]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},gblur=sigma=24[bg];"
        f"[fgsrc]scale={width}:{height}:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,trim=duration={opening_duration_s},"
        f"setpts=PTS-STARTPTS,fps={fps}[still];"
        f"[1:v]trim=start={opening_duration_s},setpts=PTS-STARTPTS,fps={fps}[tail];"
        "[still][tail]concat=n=2:v=1:a=0[v]"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [
            "ffmpeg", "-y", "-loop", "1", "-i", str(storefront), "-i", str(video),
            "-filter_complex", filter_graph,
            "-map", "[v]", "-map", "1:a?", "-t", str(duration),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", str(output),
        ],
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if completed.returncode != 0 or not output.exists() or output.stat().st_size < 1024:
        detail = (completed.stderr or completed.stdout or "unknown ffmpeg error")[-1200:]
        raise StorefrontLockError(f"真实门头首镜合成失败：{detail}")
    return output

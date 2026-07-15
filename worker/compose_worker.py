from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import requests


ProgressCallback = Callable[[dict[str, Any]], None]


class ComposeWorkerError(RuntimeError):
    pass


def validate_payload(payload: dict[str, Any]) -> None:
    job = payload.get("job")
    shots = payload.get("shots")
    if not isinstance(job, dict) or not job.get("id"):
        raise ComposeWorkerError("compose payload has no job")
    if not isinstance(shots, list) or not shots:
        raise ComposeWorkerError("compose payload has no shots")

    voiceover = job.get("voiceover")
    if not isinstance(voiceover, dict) or not voiceover.get("generated_at"):
        raise ComposeWorkerError("voiceover precompose asset is not ready")
    if voiceover.get("error"):
        raise ComposeWorkerError(f"voiceover generation failed: {voiceover['error']}")

    publish_copy = job.get("publish_copy")
    if not isinstance(publish_copy, dict) or not publish_copy.get("generated_at"):
        raise ComposeWorkerError("publish_copy precompose asset is not ready")

    for shot in shots:
        if not isinstance(shot, dict) or not shot.get("video_url"):
            raise ComposeWorkerError(f"shot {shot.get('shot_index') if isinstance(shot, dict) else '?'} has no video_url")


def build_segment_command(
    video_path: str,
    voice_path: str | None,
    output_path: str,
    duration_seconds: float,
    aspect_ratio: str,
) -> list[str]:
    duration = f"{duration_seconds:.3f}"
    video_filter = _scale_pad_filter(aspect_ratio)
    if voice_path:
        return [
            "ffmpeg", "-y", "-i", video_path, "-i", voice_path,
            "-filter_complex",
            f"[0:v]{video_filter}[v];[1:a]aresample=48000,apad[a]",
            "-map", "[v]", "-map", "[a]", "-t", duration,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", output_path,
        ]
    return [
        "ffmpeg", "-y", "-i", video_path,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-filter_complex", f"[0:v]{video_filter}[v]",
        "-map", "[v]", "-map", "1:a:0", "-t", duration,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", output_path,
    ]


def build_subtitles(shots: list[dict[str, Any]], durations: list[float]) -> list[dict[str, Any]]:
    if len(shots) != len(durations):
        raise ComposeWorkerError("shot and duration counts do not match")
    subtitles: list[dict[str, Any]] = []
    cursor = 0.0
    for shot, duration in zip(shots, durations):
        end = round(cursor + duration, 3)
        text = str(shot.get("subtitle") or shot.get("dialogue") or "").strip()
        if text:
            subtitles.append({
                "shot_index": int(shot.get("shot_index") or 0),
                "text": text,
                "start_s": round(cursor, 3),
                "end_s": end,
            })
        cursor = end
    return subtitles


def compose_job(payload: dict[str, Any], progress_cb: ProgressCallback | None = None) -> dict[str, Any]:
    validate_payload(payload)
    _require_binary("ffmpeg")
    _require_binary("ffprobe")

    job = payload["job"]
    shots = sorted(payload["shots"], key=lambda item: int(item.get("shot_index") or 0))
    job_id = _safe_name(str(job["id"]))
    output_root = Path(os.environ.get("COMPOSE_OUTPUT_DIR", "/tmp/boomer-compose")).expanduser()
    public_dir = Path(os.environ.get("COMPOSE_PUBLIC_DIR", "")).expanduser()
    public_base_url = os.environ.get("COMPOSE_PUBLIC_BASE_URL", "").rstrip("/")
    if not str(public_dir) or str(public_dir) == "." or not public_base_url:
        raise ComposeWorkerError("COMPOSE_PUBLIC_DIR and COMPOSE_PUBLIC_BASE_URL are required")

    output_root.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)
    _prune_old_outputs(public_dir)

    with tempfile.TemporaryDirectory(prefix=f"compose-{job_id}-", dir=output_root) as tmp_name:
        tmp = Path(tmp_name)
        normalized: list[Path] = []
        durations: list[float] = []
        _progress(progress_cb, 3, "download", "正在下载镜头和配音")

        for position, shot in enumerate(shots):
            duration = _shot_duration(shot)
            durations.append(duration)
            video_path = _download_https(str(shot["video_url"]), tmp / f"shot-{position:02d}.mp4")
            voice_path = None
            if shot.get("voiceover_url"):
                voice_path = _download_https(str(shot["voiceover_url"]), tmp / f"voice-{position:02d}.mp3")
            normalized_path = tmp / f"normalized-{position:02d}.mp4"
            _run(build_segment_command(
                str(video_path),
                str(voice_path) if voice_path else None,
                str(normalized_path),
                duration,
                str(job.get("aspect_ratio") or "9:16"),
            ))
            normalized.append(normalized_path)
            _progress(
                progress_cb,
                8 + int((position + 1) / len(shots) * 42),
                "normalize",
                f"已标准化镜头 {position + 1}/{len(shots)}",
            )

        concat_file = tmp / "concat.txt"
        concat_file.write_text("".join(f"file '{path.as_posix()}'\n" for path in normalized), encoding="utf-8")
        stitched = tmp / "stitched.mp4"
        _progress(progress_cb, 55, "concat", "正在拼接全部镜头")
        _run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", "-movflags", "+faststart", str(stitched),
        ])

        with_bgm = tmp / "with-bgm.mp4"
        bgm_source = _resolve_optional_asset(job, "bgm_url", "COMPOSE_DEFAULT_BGM")
        if bgm_source:
            bgm_path = _materialize_optional_asset(bgm_source, tmp / "bgm.mp3")
            _progress(progress_cb, 65, "audio", "正在混合配音和背景音乐")
            _mix_bgm(stitched, bgm_path, with_bgm, sum(durations))
        else:
            shutil.copyfile(stitched, with_bgm)

        subtitles = build_subtitles(shots, durations)
        captioned = tmp / "captioned.mp4"
        if subtitles:
            _progress(progress_cb, 74, "subtitles", "正在烧录同步字幕")
            srt_path = tmp / "subtitles.srt"
            srt_path.write_text(_build_srt(subtitles), encoding="utf-8")
            _burn_subtitles(with_bgm, srt_path, captioned)
        else:
            shutil.copyfile(with_bgm, captioned)

        branded = tmp / "branded.mp4"
        logo_source = os.environ.get("COMPOSE_LOGO_PATH", "").strip()
        if logo_source and Path(logo_source).is_file():
            _progress(progress_cb, 82, "brand", "正在添加品牌标识")
            _overlay_logo(captioned, Path(logo_source), branded)
        else:
            shutil.copyfile(captioned, branded)

        media = _verify_media(branded)
        final_name = f"{job_id}.mp4"
        cover_name = f"{job_id}.jpg"
        final_target = public_dir / final_name
        cover_target = public_dir / cover_name
        _progress(progress_cb, 90, "publish", "正在发布标准视频")
        _atomic_copy(branded, final_target)
        _extract_cover(branded, cover_target)

        _progress(progress_cb, 100, "done", "标准视频合成完成")
        return {
            "final_video_url": f"{public_base_url}/{final_name}",
            "cover_url": f"{public_base_url}/{cover_name}",
            "duration_seconds": media["duration_seconds"],
            "subtitles": subtitles,
        }


def _shot_duration(shot: dict[str, Any]) -> float:
    try:
        duration = float(shot.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0
    if duration <= 0 or duration > 30:
        raise ComposeWorkerError(f"invalid duration for shot {shot.get('shot_index')}: {duration}")
    return duration


def _scale_pad_filter(ratio: str) -> str:
    if ratio == "1:1":
        size = "720:720"
    elif ratio == "16:9":
        size = "1280:720"
    else:
        size = "720:1280"
    width, height = size.split(":")
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        "fps=30,setsar=1,format=yuv420p"
    )


def _mix_bgm(video: Path, bgm: Path, output: Path, duration: float) -> None:
    fade_start = max(0.0, duration - 1.2)
    _run([
        "ffmpeg", "-y", "-i", str(video), "-stream_loop", "-1", "-i", str(bgm),
        "-filter_complex",
        f"[0:a]volume=1.0[voice];[1:a]volume=0.12,afade=t=out:st={fade_start:.3f}:d=1.2[bgm];"
        "[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "0:v:0", "-map", "[a]", "-t", f"{duration:.3f}",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output),
    ])


def _burn_subtitles(video: Path, srt: Path, output: Path) -> None:
    style = (
        "FontName=Noto Sans CJK SC,FontSize=15,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H90000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=72"
    )
    _run([
        "ffmpeg", "-y", "-i", str(video),
        "-vf", f"subtitles={_escape_filter_path(srt)}:force_style='{style}'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "copy", "-movflags", "+faststart", str(output),
    ])


def _overlay_logo(video: Path, logo: Path, output: Path) -> None:
    _run([
        "ffmpeg", "-y", "-i", str(video), "-i", str(logo),
        "-filter_complex", "[1:v]scale=120:-1:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=0.78[logo];[0:v][logo]overlay=W-w-24:H-h-28[v]",
        "-map", "[v]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "copy", "-movflags", "+faststart", str(output),
    ])


def _build_srt(subtitles: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, item in enumerate(subtitles, start=1):
        blocks.append(
            f"{index}\n{_format_srt_time(float(item['start_s']))} --> {_format_srt_time(float(item['end_s']))}\n"
            f"{item['text']}\n"
        )
    return "\n".join(blocks)


def _format_srt_time(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _download_https(url: str, destination: Path) -> Path:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ComposeWorkerError(f"only HTTPS media URLs are allowed: {url[:120]}")
    max_bytes = int(os.environ.get("COMPOSE_MAX_DOWNLOAD_BYTES", str(300 * 1024 * 1024)))
    with requests.get(url, stream=True, timeout=(15, 180)) as response:
        response.raise_for_status()
        content_length = int(response.headers.get("Content-Length") or 0)
        if content_length and content_length > max_bytes:
            raise ComposeWorkerError(f"media is too large: {content_length} bytes")
        written = 0
        with destination.open("wb") as file_handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                written += len(chunk)
                if written > max_bytes:
                    raise ComposeWorkerError(f"media exceeded {max_bytes} bytes")
                file_handle.write(chunk)
    if destination.stat().st_size == 0:
        raise ComposeWorkerError(f"downloaded empty media: {url[:120]}")
    return destination


def _resolve_optional_asset(job: dict[str, Any], field: str, env_name: str) -> str | None:
    value = job.get(field) or (job.get("script") or {}).get(field) or os.environ.get(env_name)
    return str(value).strip() if value else None


def _materialize_optional_asset(source: str, destination: Path) -> Path:
    if source.startswith("https://"):
        return _download_https(source, destination)
    local = Path(source).expanduser()
    if not local.is_file():
        raise ComposeWorkerError(f"optional media does not exist: {source}")
    return local


def _verify_media(video: Path) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-show_streams", "-of", "json", str(video)],
        check=False, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise ComposeWorkerError(f"ffprobe failed: {result.stderr[-600:]}")
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    if not any(stream.get("codec_type") == "video" for stream in streams):
        raise ComposeWorkerError("composed file has no video stream")
    if not any(stream.get("codec_type") == "audio" for stream in streams):
        raise ComposeWorkerError("composed file has no audio stream")
    duration = float((data.get("format") or {}).get("duration") or 0)
    if duration <= 1:
        raise ComposeWorkerError(f"composed video duration is invalid: {duration}")
    return {"duration_seconds": round(duration, 2)}


def _extract_cover(video: Path, output: Path) -> None:
    _run(["ffmpeg", "-y", "-ss", "0.5", "-i", str(video), "-frames:v", "1", "-q:v", "2", str(output)])


def _atomic_copy(source: Path, destination: Path) -> None:
    temp_destination = destination.with_suffix(destination.suffix + ".tmp")
    shutil.copyfile(source, temp_destination)
    os.replace(temp_destination, destination)


def _prune_old_outputs(public_dir: Path) -> None:
    retention_days = max(1, int(os.environ.get("COMPOSE_RETENTION_DAYS", "14")))
    cutoff = time.time() - retention_days * 86_400
    for path in public_dir.iterdir():
        if path.is_file() and path.suffix.lower() in {".mp4", ".jpg"} and path.stat().st_mtime < cutoff:
            path.unlink(missing_ok=True)


def _require_binary(name: str) -> None:
    if shutil.which(name) is None:
        raise ComposeWorkerError(f"{name} is not installed")


def _run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise ComposeWorkerError(result.stderr.strip()[-1600:] or f"command failed: {' '.join(command)}")


def _escape_filter_path(path: Path) -> str:
    return str(path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _safe_name(value: str) -> str:
    safe = "".join(character if character.isalnum() or character in "-_" else "-" for character in value)
    if not safe:
        raise ComposeWorkerError("job id cannot be converted to a safe filename")
    return safe[:120]


def _progress(callback: ProgressCallback | None, percent: int, stage: str, message: str) -> None:
    if callback:
        callback({"percent": percent, "stage": stage, "message": message})

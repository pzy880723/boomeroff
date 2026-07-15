"""Run a real FFmpeg compose against small synthetic HTTPS media files."""

from __future__ import annotations

import json
import os

from worker.compose_worker import compose_job


def main() -> None:
    base_url = os.environ["COMPOSE_SMOKE_BASE_URL"].rstrip("/")
    payload = {
        "job": {
            "id": "compose-smoke",
            "aspect_ratio": "9:16",
            "voiceover": {"generated_at": "2026-07-15T00:00:00Z", "error": None},
            "publish_copy": {"generated_at": "2026-07-15T00:00:00Z", "caption": "测试"},
            "script": {},
        },
        "shots": [
            {
                "shot_index": 0,
                "duration": 4,
                "video_url": f"{base_url}/shot-0.mp4",
                "voiceover_url": f"{base_url}/voice-0.mp3",
                "subtitle": "第一段测试字幕",
            },
            {
                "shot_index": 1,
                "duration": 5,
                "video_url": f"{base_url}/shot-1.mp4",
                "voiceover_url": f"{base_url}/voice-1.mp3",
                "subtitle": "第二段测试字幕",
            },
        ],
    }
    print(json.dumps(compose_job(payload), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

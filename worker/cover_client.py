from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests


class CoverConfigError(RuntimeError):
    pass


@dataclass(slots=True)
class CoverConfig:
    base_url: str
    worker_token: str
    worker_id: str

    @classmethod
    def from_env(cls) -> "CoverConfig":
        base_url = (
            os.environ.get("COVER_CLOUD_BASE_URL")
            or os.environ.get("WORKER_CLOUD_BASE_URL")
            or ""
        ).strip().rstrip("/")
        token = (
            os.environ.get("COVER_WORKER_TOKEN")
            or os.environ.get("COMPOSE_WORKER_TOKEN")
            or ""
        ).strip()
        worker_id = (
            os.environ.get("COVER_WORKER_ID")
            or os.environ.get("WORKER_ID")
            or "tencent-cover-01"
        ).strip()
        if not base_url:
            raise CoverConfigError("Missing COVER_CLOUD_BASE_URL or WORKER_CLOUD_BASE_URL")
        if not token:
            raise CoverConfigError("Missing COVER_WORKER_TOKEN")
        return cls(base_url=base_url, worker_token=token, worker_id=worker_id)


class CoverCloudClient:
    def __init__(self, config: CoverConfig, *, session: Any | None = None):
        self.config = config
        self.session = session or requests.Session()

    def claim_next(self) -> dict[str, Any] | None:
        response = self.session.post(
            f"{self.config.base_url}/functions/v1/cover-claim-next",
            headers=self._headers(),
            json={"worker_id": self.config.worker_id},
            timeout=30,
        )
        data = _json_response(response)
        if not response.ok:
            raise RuntimeError(f"cover claim failed: {response.status_code} {data}")
        if not isinstance(data, dict) or not isinstance(data.get("job"), dict):
            return None
        return data

    def heartbeat(
        self,
        heartbeat_url: str,
        job_id: str,
        progress: dict[str, Any],
    ) -> None:
        response = self.session.post(
            heartbeat_url,
            headers=self._headers(),
            json={
                "job_id": job_id,
                "worker_id": self.config.worker_id,
                "progress": progress,
            },
            timeout=20,
        )
        data = _json_response(response)
        if not response.ok:
            raise RuntimeError(f"cover heartbeat failed: {response.status_code} {data}")

    def callback_success(
        self,
        callback_url: str,
        job_id: str,
        result: dict[str, Any],
    ) -> None:
        payload = {
            "job_id": job_id,
            "cover_url": result["cover_url"],
            "optimized_video_url": result.get("optimized_video_url"),
            "reference_frame_count": int(result["reference_frame_count"]),
            "copy_fingerprint": str(result["copy_fingerprint"]),
            "variation_key": str(result["variation_key"]),
            "cover_style_key": str(result.get("cover_style_key") or ""),
            "cover_style_label": str(result.get("cover_style_label") or ""),
        }
        response = self.session.post(
            callback_url,
            headers=self._headers(),
            json=payload,
            timeout=30,
        )
        data = _json_response(response)
        if not response.ok:
            raise RuntimeError(f"cover callback failed: {response.status_code} {data}")

    def callback_failed(self, callback_url: str, job_id: str, error: str) -> None:
        response = self.session.post(
            callback_url,
            headers=self._headers(),
            json={"job_id": job_id, "error": error},
            timeout=30,
        )
        data = _json_response(response)
        if not response.ok:
            raise RuntimeError(f"cover failed callback failed: {response.status_code} {data}")

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-Worker-Token": self.config.worker_token,
        }


def _json_response(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text[:500]}

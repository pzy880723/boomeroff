from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import requests


class ComposeConfigError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ComposeConfig:
    base_url: str
    worker_token: str
    worker_id: str
    poll_interval_seconds: float

    @classmethod
    def from_env(cls) -> "ComposeConfig":
        base_url = (os.environ.get("COMPOSE_CLOUD_BASE_URL") or "").strip().rstrip("/")
        token = (os.environ.get("COMPOSE_WORKER_TOKEN") or "").strip()
        worker_id = (os.environ.get("COMPOSE_WORKER_ID") or "tencent-compose-01").strip()
        if not base_url:
            raise ComposeConfigError("COMPOSE_CLOUD_BASE_URL is required")
        if not token:
            raise ComposeConfigError("COMPOSE_WORKER_TOKEN is required")
        return cls(
            base_url=base_url,
            worker_token=token,
            worker_id=worker_id,
            poll_interval_seconds=max(5.0, float(os.environ.get("COMPOSE_POLL_INTERVAL_SECONDS", "20"))),
        )


class ComposeCloudClient:
    def __init__(self, config: ComposeConfig):
        self.config = config
        self.session = requests.Session()

    def claim_next(self) -> dict[str, Any] | None:
        data = self._post(
            f"{self.config.base_url}/functions/v1/compose-claim-next",
            {"worker_id": self.config.worker_id},
            timeout=30,
        )
        return data if data.get("job") else None

    def heartbeat(self, url: str, job_id: str, progress: dict[str, Any] | None = None) -> None:
        self._post(url, {"job_id": job_id, "worker_id": self.config.worker_id, "progress": progress}, timeout=20)

    def callback_success(self, url: str, job_id: str, result: dict[str, Any]) -> None:
        self._post(url, {
            "job_id": job_id,
            "final_video_url": result["final_video_url"],
            "cover_url": result.get("cover_url"),
            "duration_seconds": result.get("duration_seconds"),
        }, timeout=30)

    def callback_failed(self, url: str, job_id: str, error: str) -> None:
        self._post(url, {"job_id": job_id, "error": error[:1800]}, timeout=30)

    def _post(self, url: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
        response = self.session.post(url, headers=self._headers(), json=payload, timeout=timeout)
        try:
            data = response.json()
        except ValueError:
            data = {"ok": False, "error": response.text[:500]}
        if not response.ok or data.get("ok") is False:
            raise RuntimeError(f"compose API failed: {response.status_code} {data}")
        return data

    def _headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "X-Worker-Token": self.config.worker_token}

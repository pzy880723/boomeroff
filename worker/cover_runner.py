from __future__ import annotations

import os
import time
import traceback
from typing import Any

from worker.cover_client import CoverCloudClient, CoverConfig
from worker.cover_pipeline import generate_cover


def main() -> None:
    config = CoverConfig.from_env()
    client = CoverCloudClient(config)
    interval = float(os.environ.get("COVER_POLL_INTERVAL_SECONDS", "20"))
    once = os.environ.get("COVER_ONCE", "").lower() in {"1", "true", "yes"}
    print(
        f"[cover] start worker_id={config.worker_id} "
        f"base={config.base_url} interval={interval}s"
    )

    while True:
        try:
            payload = client.claim_next()
            if payload:
                process_payload(client, config.worker_id, payload)
        except Exception as exc:
            print(f"[cover] poll failed: {exc}")
            traceback.print_exc()

        if once:
            break
        time.sleep(interval)


def process_payload(
    client: CoverCloudClient,
    worker_id: str,
    payload: dict[str, Any],
) -> None:
    job = payload["job"]
    claim = payload.get("claim") if isinstance(payload.get("claim"), dict) else {}
    job_id = str(job["id"])
    callback_url = (
        claim.get("callback_url")
        or f"{client.config.base_url}/functions/v1/cover-callback"
    )
    heartbeat_url = (
        claim.get("heartbeat_url")
        or f"{client.config.base_url}/functions/v1/cover-heartbeat"
    )

    def heartbeat(progress: dict[str, Any]) -> None:
        client.heartbeat(heartbeat_url, job_id, progress)

    try:
        heartbeat(
            {
                "percent": 1,
                "stage": "claimed",
                "message": f"腾讯云 Cover Worker {worker_id} 已领取任务",
            }
        )
        result = generate_cover(payload, progress_cb=heartbeat)
        client.callback_success(callback_url, job_id, result)
        print(f"[cover] job success job_id={job_id} url={result['cover_url']}")
    except Exception as exc:
        print(f"[cover] job failed job_id={job_id}: {exc}")
        try:
            client.callback_failed(callback_url, job_id, str(exc))
        except Exception as callback_exc:
            print(f"[cover] failed callback failed job_id={job_id}: {callback_exc}")


if __name__ == "__main__":
    main()

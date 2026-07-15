from __future__ import annotations

import logging
import os
import threading
import time

from worker.compose_client import ComposeCloudClient, ComposeConfig
from worker.compose_worker import compose_job


LOGGER = logging.getLogger("boomer.compose")


def process_payload(client: ComposeCloudClient, payload: dict) -> None:
    job = payload["job"]
    claim = payload.get("claim") or {}
    job_id = str(job["id"])
    heartbeat_url = claim.get("heartbeat_url") or f"{client.config.base_url}/functions/v1/compose-heartbeat"
    callback_url = claim.get("callback_url") or f"{client.config.base_url}/functions/v1/compose-callback"
    stop_heartbeat = threading.Event()
    last_progress: dict = {"percent": 1, "stage": "claimed", "message": "腾讯云 Worker 已领取任务"}

    def heartbeat_loop() -> None:
        while not stop_heartbeat.wait(45):
            try:
                client.heartbeat(heartbeat_url, job_id, last_progress)
            except Exception:
                LOGGER.exception("heartbeat failed job_id=%s", job_id)

    heartbeat_thread = threading.Thread(target=heartbeat_loop, name=f"heartbeat-{job_id}", daemon=True)
    try:
        client.heartbeat(heartbeat_url, job_id, last_progress)
        heartbeat_thread.start()

        def report(progress: dict) -> None:
            nonlocal last_progress
            last_progress = progress
            client.heartbeat(heartbeat_url, job_id, progress)

        result = compose_job(payload, progress_cb=report)
        client.callback_success(callback_url, job_id, result)
        LOGGER.info("compose complete job_id=%s url=%s", job_id, result["final_video_url"])
    except Exception as error:
        LOGGER.exception("compose failed job_id=%s", job_id)
        try:
            client.callback_failed(callback_url, job_id, str(error))
        except Exception:
            LOGGER.exception("failure callback failed job_id=%s", job_id)
    finally:
        stop_heartbeat.set()
        if heartbeat_thread.is_alive():
            heartbeat_thread.join(timeout=2)


def main() -> None:
    logging.basicConfig(
        level=os.environ.get("COMPOSE_LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    config = ComposeConfig.from_env()
    client = ComposeCloudClient(config)
    run_once = os.environ.get("COMPOSE_ONCE", "").lower() in {"1", "true", "yes"}
    LOGGER.info("starting worker id=%s base=%s", config.worker_id, config.base_url)
    while True:
        try:
            payload = client.claim_next()
            if payload:
                process_payload(client, payload)
        except Exception:
            LOGGER.exception("claim loop failed")
        if run_once:
            return
        time.sleep(config.poll_interval_seconds)


if __name__ == "__main__":
    main()

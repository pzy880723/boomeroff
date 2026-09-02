from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from worker.cover_client import CoverCloudClient, CoverConfig
from worker.cover_runner import process_payload


class _Response:
    ok = True
    status_code = 200
    text = ""

    def __init__(self, payload):
        self.payload = payload

    def json(self):
        return self.payload


class _Session:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.responses.pop(0) if self.responses else _Response({"ok": True})


class CoverWorkerContractTests(unittest.TestCase):
    def setUp(self):
        self.config = CoverConfig(
            base_url="https://cloud.example",
            worker_token="worker-secret",
            worker_id="cover-worker-01",
        )

    def test_claim_uses_dedicated_cover_endpoint_and_worker_identity(self):
        session = _Session([_Response({"job": {"id": "job-1"}})])
        client = CoverCloudClient(self.config, session=session)

        payload = client.claim_next()

        self.assertEqual(payload["job"]["id"], "job-1")
        self.assertEqual(session.calls[0]["url"], "https://cloud.example/functions/v1/cover-claim-next")
        self.assertEqual(session.calls[0]["json"], {"worker_id": "cover-worker-01"})
        self.assertEqual(session.calls[0]["headers"]["X-Worker-Token"], "worker-secret")

    def test_success_callback_contains_cover_audit_fields(self):
        session = _Session()
        client = CoverCloudClient(self.config, session=session)

        client.callback_success(
            "https://cloud.example/functions/v1/cover-callback",
            "job-1",
            {
                "cover_url": "https://cdn.example/job-1-cover.png",
                "optimized_video_url": "https://cdn.example/job-1-faststart.mp4",
                "delivery_video_url": "https://app.example/media/job-1-faststart.mp4",
                "reference_frame_count": 4,
                "copy_fingerprint": "copy-hash",
                "variation_key": "variation-hash",
                "cover_style_key": "warm_store_walk",
                "cover_style_label": "暖色店内漫游",
                "storefront_locked": False,
                "storefront_reference_url": None,
            },
        )

        self.assertEqual(
            session.calls[0]["json"],
            {
                "job_id": "job-1",
                "cover_url": "https://cdn.example/job-1-cover.png",
                "optimized_video_url": "https://cdn.example/job-1-faststart.mp4",
                "delivery_video_url": "https://app.example/media/job-1-faststart.mp4",
                "reference_frame_count": 4,
                "copy_fingerprint": "copy-hash",
                "variation_key": "variation-hash",
                "cover_style_key": "warm_store_walk",
                "cover_style_label": "暖色店内漫游",
                "storefront_locked": False,
                "storefront_reference_url": None,
            },
        )

    def test_runner_reports_success_only_after_pipeline_returns_cover(self):
        client = Mock()
        client.config = self.config
        payload = {
            "job": {"id": "job-1"},
            "claim": {
                "callback_url": "https://cloud.example/functions/v1/cover-callback",
                "heartbeat_url": "https://cloud.example/functions/v1/cover-heartbeat",
            },
        }
        result = {
            "cover_url": "https://cdn.example/job-1-cover.png",
            "reference_frame_count": 3,
            "copy_fingerprint": "copy-hash",
            "variation_key": "variation-hash",
        }

        with patch("worker.cover_runner.generate_cover", return_value=result):
            process_payload(client, self.config.worker_id, payload)

        client.callback_success.assert_called_once_with(
            "https://cloud.example/functions/v1/cover-callback",
            "job-1",
            result,
        )
        client.callback_failed.assert_not_called()

    def test_runner_reports_failure_and_never_reports_success(self):
        client = Mock()
        client.config = self.config
        payload = {"job": {"id": "job-1"}, "claim": {}}

        with patch("worker.cover_runner.generate_cover", side_effect=RuntimeError("provider failed")):
            process_payload(client, self.config.worker_id, payload)

        client.callback_failed.assert_called_once()
        client.callback_success.assert_not_called()


if __name__ == "__main__":
    unittest.main()

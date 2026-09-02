from __future__ import annotations

import base64
import io
import inspect
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

from worker.cover_pipeline import (
    COVER_STYLE_PRESETS,
    CoverPipelineError,
    FrameCandidate,
    GptImage2Client,
    SeedreamClient,
    SeedreamProxyClient,
    build_cover_prompt,
    build_faststart_command,
    build_cover_clients,
    choose_cover_base_candidate,
    choose_cover_candidate,
    choose_reference_candidates,
    generate_cover_candidates,
    generate_cover,
    normalize_cover_png,
    render_cover_text,
    script_expects_character,
    select_reference_frames,
    select_cover_style,
)


class _JsonResponse:
    def __init__(self, payload: dict, *, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.text = ""
        self.headers = {"Content-Type": "application/json"}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if not self.ok:
            raise RuntimeError(f"HTTP {self.status_code}")


class _RecordingSession:
    def __init__(self, response: _JsonResponse):
        self.response = response
        self.calls: list[dict] = []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.response


class _SseResponse(_JsonResponse):
    def __init__(self, events: list[dict], *, status_code: int = 200):
        super().__init__({}, status_code=status_code)
        self.events = events
        self.headers = {"Content-Type": "text/event-stream"}

    def iter_lines(self, decode_unicode=False):
        for event in self.events:
            line = f"data: {json.dumps(event, ensure_ascii=False)}"
            yield line if decode_unicode else line.encode("utf-8")
        yield "data: [DONE]" if decode_unicode else b"data: [DONE]"


class _SequenceSession(_RecordingSession):
    def __init__(self, responses: list[_JsonResponse]):
        super().__init__(responses[-1])
        self.responses = list(responses)

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return self.responses.pop(0)


class _RecordingSeedream:
    def __init__(self):
        self.calls: list[tuple[str, list[Path]]] = []

    def generate(self, prompt: str, references: list[Path]) -> bytes:
        self.calls.append((prompt, list(references)))
        return f"candidate-{len(self.calls)}".encode()


class CoverPipelineTests(unittest.TestCase):
    def test_faststart_video_keeps_original_streams_without_reencoding(self):
        command = build_faststart_command("input.mp4", "output.mp4")

        self.assertEqual(command[:4], ["ffmpeg", "-y", "-i", "input.mp4"])
        self.assertIn("copy", command)
        self.assertEqual(command[-3:], ["-movflags", "+faststart", "output.mp4"])

    def test_cover_style_library_records_all_approved_visual_directions(self):
        self.assertEqual(
            [preset.key for preset in COVER_STYLE_PRESETS],
            [
                "reaction_closeup",
                "object_macro",
                "guide_card",
                "store_atmosphere",
                "large_title_depth",
                "emotion_checklist",
                "quiet_corner",
                "warm_store_walk",
                "cinematic_aisle",
            ],
        )
        self.assertTrue(all(preset.prompt.strip() for preset in COVER_STYLE_PRESETS))

    def test_cover_style_is_stable_per_job_and_can_be_explicitly_overridden(self):
        payload = {"job": {"id": "video-job-42", "script": {"title": "周末探店"}}}
        first = select_cover_style(payload)
        second = select_cover_style(payload)
        self.assertEqual(first.key, second.key)

        overridden = select_cover_style(
            {
                "job": {
                    "id": "video-job-42",
                    "cover_generation": {"style_key": "warm_store_walk"},
                }
            }
        )
        self.assertEqual(overridden.key, "warm_store_walk")

    def test_cover_without_detectable_people_uses_scene_safe_style(self):
        selected = select_cover_style(
            {
                "job": {
                    "id": "video-job-without-face",
                    "cover_generation": {"style_key": "reaction_closeup"},
                }
            },
            allow_people=False,
        )

        self.assertIn(selected.key, {"object_macro", "store_atmosphere", "large_title_depth"})

    def test_cover_prompt_includes_selected_lifestyle_editorial_style(self):
        prompt = build_cover_prompt(
            {
                "job": {
                    "id": "video-job-night",
                    "script": {"title": "下班逛中古店"},
                    "cover_generation": {"style_key": "warm_store_walk"},
                }
            }
        )

        self.assertIn("本次随机版式：暖色店内漫游", prompt)
        self.assertIn("真实中古店内", prompt)
        self.assertIn("不得照抄参考图中的人物、地点、物品或文字", prompt)
        self.assertIn("禁止生成草原、乡村、地铁、咖啡店", prompt)

    def test_cover_clients_prefer_cloud_seedream_and_keep_dmx_as_fallback(self):
        with patch.dict(
            "os.environ",
            {
                "COVER_CLOUD_BASE_URL": "https://cloud.example",
                "COVER_WORKER_TOKEN": "worker-secret",
                "DMXAPI_API_KEY": "dmx-secret",
            },
            clear=True,
        ):
            clients = build_cover_clients()

        self.assertEqual([source for source, _client in clients], ["seedream-5.0-lite", "gpt-image-2-ssvip"])
        self.assertIsInstance(clients[0][1], SeedreamProxyClient)
        self.assertEqual(
            clients[0][1].endpoint,
            "https://cloud.example/functions/v1/cover-seedream-generate",
        )

    def test_gpt_image_two_sends_multiple_references_as_multipart(self):
        generated = b"image-two-cover"
        session = _RecordingSession(
            _JsonResponse({"data": [{"b64_json": base64.b64encode(generated).decode("ascii")}]}),
        )
        client = GptImage2Client(api_key="dmx-secret", session=session)

        with tempfile.TemporaryDirectory() as tmp:
            identity = Path(tmp) / "identity.jpg"
            style = Path(tmp) / "style.png"
            identity.write_bytes(b"identity")
            style.write_bytes(b"style")

            result = client.generate("保持人物一致并生成全新封面", [identity, style])

        self.assertEqual(result, generated)
        request = session.calls[0]
        self.assertEqual(request["url"], "https://www.dmxapi.cn/v1/images/edits")
        self.assertEqual(request["headers"]["Authorization"], "Bearer dmx-secret")
        self.assertNotIn("Content-Type", request["headers"])
        self.assertEqual(request["data"]["model"], "gpt-image-2-ssvip")
        self.assertEqual(request["data"]["size"], "1024x1360")
        self.assertEqual(request["data"]["quality"], "high")
        self.assertEqual([item[0] for item in request["files"]], ["image", "image"])
        self.assertEqual(request["files"][0][1][2], "image/jpeg")
        self.assertEqual(request["files"][1][1][2], "image/png")

    def test_gpt_image_two_requires_dmx_key_and_reference(self):
        with self.assertRaisesRegex(CoverPipelineError, "DMXAPI_API_KEY"):
            GptImage2Client(api_key="")

        client = GptImage2Client(api_key="secret", session=_RecordingSession(_JsonResponse({})))
        with self.assertRaisesRegex(CoverPipelineError, "参考图"):
            client.generate("prompt", [])

    def test_reference_ranking_keeps_high_quality_frames_apart(self):
        frames = [
            FrameCandidate(index=0, timestamp_s=0.5, image=np.zeros((10, 10, 3)), face_boxes=[(0, 0, 5, 5)], quality=0.90),
            FrameCandidate(index=1, timestamp_s=0.8, image=np.zeros((10, 10, 3)), face_boxes=[(0, 0, 5, 5)], quality=0.89),
            FrameCandidate(index=2, timestamp_s=5.0, image=np.zeros((10, 10, 3)), face_boxes=[(0, 0, 5, 5)], quality=0.80),
            FrameCandidate(index=3, timestamp_s=10.0, image=np.zeros((10, 10, 3)), face_boxes=[(0, 0, 5, 5)], quality=0.70),
        ]

        picked = choose_reference_candidates(frames, max_frames=3, min_gap_s=2.0)

        self.assertEqual([item.index for item in picked], [0, 2, 3])

    def test_cover_base_uses_the_actual_video_character_frame(self):
        frames = [
            FrameCandidate(
                index=0,
                timestamp_s=0.5,
                image=np.full((120, 80, 3), 20, dtype=np.uint8),
                face_boxes=[],
                quality=0.95,
            ),
            FrameCandidate(
                index=1,
                timestamp_s=4.0,
                image=np.full((120, 80, 3), 80, dtype=np.uint8),
                face_boxes=[(20, 20, 30, 30)],
                quality=0.72,
            ),
            FrameCandidate(
                index=2,
                timestamp_s=8.0,
                image=np.full((120, 80, 3), 120, dtype=np.uint8),
                face_boxes=[(20, 20, 30, 30)],
                quality=0.88,
            ),
        ]

        selected = choose_cover_base_candidate(frames)

        self.assertEqual(selected.index, 2)
        self.assertEqual(selected.timestamp_s, 8.0)

    def test_cover_base_uses_opening_character_frame_when_face_detector_misses(self):
        frames = [
            FrameCandidate(
                index=0,
                timestamp_s=0.4,
                image=np.full((120, 80, 3), 20, dtype=np.uint8),
                face_boxes=[],
                quality=0.2,
            ),
            FrameCandidate(
                index=1,
                timestamp_s=5.0,
                image=np.full((120, 80, 3), 80, dtype=np.uint8),
                face_boxes=[],
                quality=0.9,
            ),
        ]

        selected = choose_cover_base_candidate(frames, character_expected=True)

        self.assertEqual(selected.index, 0)
        self.assertEqual(selected.timestamp_s, 0.4)

    def test_character_expectation_comes_from_the_video_script(self):
        self.assertTrue(script_expects_character({"script": {"persona": {"gender": "male"}}}))
        self.assertTrue(
            script_expects_character(
                {"script": {"__render_payload": {"prompt": "【唯一主角】42岁家居主理人大叔"}}}
            )
        )
        self.assertFalse(script_expects_character({"script": {"title": "纯商品展示"}}))

    def test_video_without_detectable_person_uses_spaced_scene_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "input.mp4"
            video.write_bytes(b"video")
            output = Path(tmp) / "refs"

            references = select_reference_frames(
                video,
                output,
                sampler=lambda _video: [
                    FrameCandidate(
                        index=index,
                        timestamp_s=float(index * 3),
                        image=np.full((40, 40, 3), index * 30, dtype=np.uint8),
                        face_boxes=[],
                        quality=0.9 - index * 0.1,
                    )
                    for index in range(3)
                ],
            )

            self.assertEqual(len(references), 3)
            self.assertTrue(all(path.name.startswith("scene-ref-") for path in references))
            self.assertTrue(all(path.exists() for path in references))

    def test_reference_selection_keeps_people_then_backfills_scene_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "input.mp4"
            video.write_bytes(b"video")
            references = select_reference_frames(
                video,
                Path(tmp) / "refs",
                sampler=lambda _video: [
                    FrameCandidate(
                        index=0,
                        timestamp_s=0.5,
                        image=np.full((80, 80, 3), 20, dtype=np.uint8),
                        face_boxes=[(20, 20, 20, 20)],
                        quality=0.95,
                    ),
                    FrameCandidate(
                        index=1,
                        timestamp_s=4.0,
                        image=np.full((80, 80, 3), 60, dtype=np.uint8),
                        face_boxes=[],
                        quality=0.8,
                    ),
                    FrameCandidate(
                        index=2,
                        timestamp_s=8.0,
                        image=np.full((80, 80, 3), 100, dtype=np.uint8),
                        face_boxes=[],
                        quality=0.7,
                    ),
                ],
            )

            self.assertEqual(len(references), 3)
            self.assertEqual(references[0].name, "character-ref-01.jpg")
            self.assertEqual(references[1].name, "scene-ref-02.jpg")
            self.assertEqual(references[2].name, "scene-ref-03.jpg")

    def test_seedream_receives_every_video_reference_and_returns_generated_bytes(self):
        generated = b"new-cover-image"
        session = _RecordingSession(
            _JsonResponse({"data": [{"b64_json": base64.b64encode(generated).decode("ascii")}]})
        )
        client = SeedreamClient(api_key="secret", session=session)

        with tempfile.TemporaryDirectory() as tmp:
            refs = []
            for index in range(3):
                path = Path(tmp) / f"ref-{index}.jpg"
                path.write_bytes(f"frame-{index}".encode())
                refs.append(path)

            result = client.generate("保持人物一致，不要生成文字", refs)

        self.assertEqual(result, generated)
        request = session.calls[0]
        self.assertEqual(
            request["json"]["model"],
            "doubao-seedream-5-0-lite-260128",
        )
        self.assertEqual(len(request["json"]["image"]), 3)
        self.assertTrue(all(item.startswith("data:image/jpeg;base64,") for item in request["json"]["image"]))
        self.assertIn("不要生成文字", request["json"]["prompt"])

    def test_seedream_malformed_response_is_rejected(self):
        client = SeedreamClient(
            api_key="secret",
            session=_RecordingSession(_JsonResponse({"data": [{}]})),
        )
        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.jpg"
            ref.write_bytes(b"frame")
            with self.assertRaisesRegex(CoverPipelineError, "没有返回图片"):
                client.generate("prompt", [ref])

    def test_seedream_proxy_reuses_cloud_ark_secret_without_exposing_it_to_worker(self):
        generated = b"cloud-generated-cover"
        session = _RecordingSession(
            _JsonResponse({"data": [{"b64_json": base64.b64encode(generated).decode("ascii")}]})
        )
        client = SeedreamProxyClient(
            endpoint="https://example.supabase.co/functions/v1/cover-seedream-generate",
            worker_token="worker-secret",
            session=session,
        )

        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.jpg"
            ref.write_bytes(b"frame")
            result = client.generate("保持视频人物一致", [ref])

        self.assertEqual(result, generated)
        request = session.calls[0]
        self.assertEqual(request["headers"]["X-Worker-Token"], "worker-secret")
        self.assertNotIn("Authorization", request["headers"])
        self.assertEqual(len(request["json"]["image"]), 1)
        self.assertNotIn("api_key", request["json"])

    def test_seedream_proxy_retries_transient_gateway_timeout(self):
        generated = b"cover-after-retry"
        session = _SequenceSession(
            [
                _JsonResponse({"error": "timeout"}, status_code=504),
                _JsonResponse(
                    {"data": [{"b64_json": base64.b64encode(generated).decode("ascii")}]}
                ),
            ]
        )
        client = SeedreamProxyClient(
            endpoint="https://example.supabase.co/functions/v1/cover-seedream-generate",
            worker_token="worker-secret",
            session=session,
            max_attempts=2,
            sleep=lambda _seconds: None,
        )

        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.jpg"
            ref.write_bytes(b"frame")
            result = client.generate("保持视频人物一致", [ref])

        self.assertEqual(result, generated)
        self.assertEqual(len(session.calls), 2)

    def test_seedream_proxy_consumes_streamed_ark_events(self):
        generated = b"streamed-cover"
        session = _RecordingSession(
            _SseResponse(
                [
                    {"type": "image_generation.started"},
                    {
                        "type": "image_generation.completed",
                        "data": [
                            {
                                "b64_json": base64.b64encode(generated).decode("ascii")
                            }
                        ],
                    },
                ]
            )
        )
        client = SeedreamProxyClient(
            endpoint="https://example.supabase.co/functions/v1/cover-seedream-generate",
            worker_token="worker-secret",
            session=session,
        )

        with tempfile.TemporaryDirectory() as tmp:
            ref = Path(tmp) / "ref.jpg"
            ref.write_bytes(b"frame")
            result = client.generate("保持人物一致", [ref])

        self.assertEqual(result, generated)
        self.assertTrue(session.calls[0]["stream"])
        self.assertEqual(session.calls[0]["headers"]["Accept"], "text/event-stream")

    def test_cover_prompt_requests_exact_copy_and_real_skin_texture(self):
        prompt = build_cover_prompt(
            {
                "job": {
                    "script": {"title": "南京西路中古杂货铺探店"},
                    "cover_generation": {
                        "copy": {
                            "headline": "南京西路B1藏着中古杂货铺",
                            "subtitle": "下班顺路翻到复古玩具",
                            "highlight_keyword": "中古杂货",
                        },
                        "variation": {
                            "people_count": 1,
                            "action": "把复古玩具递向镜头",
                            "product": "复古玩具",
                            "camera": "18mm近距离广角",
                        }
                    },
                }
            }
        )

        self.assertIn("三格内容证据板", prompt)
        self.assertIn("真实存在的人物、场景和商品", prompt)
        self.assertIn('标题必须逐字写成“南京西路B1藏着中古杂货铺”', prompt)
        self.assertIn('副标题必须逐字写成“下班顺路翻到复古玩具”', prompt)
        self.assertIn('高亮关键词必须逐字写成“中古杂货”', prompt)
        self.assertIn("自然毛孔", prompt)
        self.assertIn("细小面部绒毛", prompt)
        self.assertIn("禁止塑料皮", prompt)
        self.assertIn("把复古玩具递向镜头", prompt)
        self.assertIn("18mm近距离广角", prompt)
        self.assertNotIn("不要生成任何文字", prompt)

    def test_cover_prompt_uses_editorial_local_shock_composition(self):
        prompt = build_cover_prompt(
            {
                "job": {
                    "script": {"title": "南京西路中古杂货铺探店"},
                    "cover_generation": {
                        "variation": {
                            "people_count": 2,
                            "action": "hold_product_to_camera",
                            "product": "retro_camera",
                            "camera": "wide_closeup",
                        }
                    },
                }
            }
        )

        self.assertIn("顶部标题区与人物、商品互相压叠", prompt)
        self.assertIn("前景商品占画面下方约 25%–35%", prompt)
        self.assertIn("不能生成普通站姿、普通微笑或商品证件照", prompt)
        self.assertNotIn("预留约 40% 深色或低细节区域", prompt)

    def test_two_person_variation_uses_editorial_foreground_background_composite(self):
        prompt = build_cover_prompt(
            {
                "job": {
                    "script": {
                        "title": "48岁潮叔探店BOOMER·OFF",
                        "continuous_dialogue": "上手这只佐藤象，再翻到一张复古黑胶",
                        "persona": {"group_type": "solo", "companions": []},
                    },
                    "cover_generation": {
                        "variation": {
                            "people_count": 2,
                            "product": "BOOMEROFF",
                        }
                    },
                }
            }
        )

        self.assertIn("允许同一位视频主角在同一封面出现两次", prompt)
        self.assertIn("一大一小、前后分层", prompt)
        self.assertIn("表情与动作不同", prompt)
        self.assertIn("不能做成两个同尺寸人物平铺", prompt)
        self.assertIn("上手这只佐藤象，再翻到一张复古黑胶", prompt)
        self.assertIn("品牌名不能被当作商品", prompt)

    def test_generates_four_candidates_with_storefront_content_board_and_style_ref(self):
        client = _RecordingSeedream()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            character_refs = []
            for index in range(4):
                path = root / f"character-{index}.jpg"
                Image.new("RGB", (320, 480), (index * 50, 30, 20)).save(path)
                character_refs.append(path)
            style_ref = root / "approved-local-shock-style.png"
            Image.new("RGB", (600, 800), (10, 20, 30)).save(style_ref)
            storefront_ref = root / "real-storefront.jpg"
            Image.new("RGB", (640, 480), (200, 20, 20)).save(storefront_ref)

            candidates = generate_cover_candidates(
                client,
                "editorial cover",
                character_refs,
                style_ref,
                storefront_reference=storefront_ref,
                count=4,
            )

            self.assertEqual(candidates, [b"candidate-1", b"candidate-2", b"candidate-3", b"candidate-4"])
            self.assertEqual(len(client.calls), 4)
            for index, (prompt, references) in enumerate(client.calls, start=1):
                self.assertIn(f"候选构图编号：{index}", prompt)
                self.assertEqual(len(references), 2)
                self.assertEqual(references[1], style_ref)
                self.assertEqual(references[0].name, "content-reference-board.jpg")
                with Image.open(references[0]) as board:
                    self.assertEqual(board.size, (1536, 768))
                    sampled = board.getpixel((256, 384))
                    self.assertTrue(all(abs(actual - expected) <= 3 for actual, expected in zip(sampled, (200, 20, 20))))

    def test_cover_candidate_selection_uses_highest_visual_score(self):
        candidates = [b"plain", b"approved-style", b"weak"]
        scores = {b"plain": 0.2, b"approved-style": 0.95, b"weak": 0.1}

        selected = choose_cover_candidate(
            candidates,
            scorer=lambda candidate: scores[candidate],
        )

        self.assertEqual(selected, b"approved-style")

    def test_normalize_cover_png_converts_jpeg_bytes_to_real_png(self):
        source = io.BytesIO()
        Image.new("RGB", (16, 16), (220, 20, 20)).save(source, format="JPEG")

        normalized = normalize_cover_png(source.getvalue())

        self.assertTrue(normalized.startswith(b"\x89PNG\r\n\x1a\n"))
        with Image.open(io.BytesIO(normalized)) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.size, (16, 16))

    def test_pipeline_keeps_video_motion_and_locks_cover_to_actual_character(self):
        source = inspect.getsource(generate_cover)
        self.assertNotIn("lock_storefront_opening(", source)
        self.assertIn("render_cover_text(", source)
        self.assertIn("build_cover_clients()", source)
        self.assertIn('"cover_source": selected_source', source)

    def test_editorial_overlay_preserves_video_frame_as_cover_background(self):
        with tempfile.TemporaryDirectory() as tmp:
            font_candidates = [
                Path("/System/Library/Fonts/STHeiti Medium.ttc"),
                Path("/System/Library/Fonts/PingFang.ttc"),
            ]
            font = next((path for path in font_candidates if path.is_file()), None)
            if font is None:
                self.skipTest("No CJK font available in this test environment")

            source = io.BytesIO()
            Image.new("RGB", (600, 800), (42, 84, 126)).save(source, format="PNG")
            rendered = render_cover_text(
                source.getvalue(),
                {
                    "headline": "进店就想翻",
                    "subtitle": "中古好物太多了",
                    "highlight_keyword": "中古好物",
                    "badges": ["6.9元起"],
                },
                font,
                font,
            )

            with Image.open(io.BytesIO(rendered)) as result:
                self.assertEqual(result.size, (600, 800))
                self.assertEqual(result.getpixel((590, 790)), (42, 84, 126))


if __name__ == "__main__":
    unittest.main()

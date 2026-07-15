import unittest

from worker.compose_worker import (
    ComposeWorkerError,
    build_segment_command,
    build_subtitles,
    validate_payload,
)


class DirectorComposeWorkerTests(unittest.TestCase):
    def test_segment_command_keeps_video_duration_when_voiceover_is_shorter(self):
        command = build_segment_command(
            video_path="shot.mp4",
            voice_path="voice.mp3",
            output_path="normalized.mp4",
            duration_seconds=5.0,
            aspect_ratio="9:16",
        )

        self.assertIn("apad", " ".join(command))
        self.assertNotIn("-shortest", command)
        self.assertEqual(command[command.index("-t") + 1], "5.000")

    def test_segment_without_voiceover_still_gets_a_silent_audio_track(self):
        command = build_segment_command(
            video_path="shot.mp4",
            voice_path=None,
            output_path="normalized.mp4",
            duration_seconds=4.0,
            aspect_ratio="9:16",
        )

        self.assertIn("anullsrc=channel_layout=stereo:sample_rate=48000", command)
        self.assertIn("-c:a", command)

    def test_subtitles_follow_actual_segment_durations(self):
        shots = [
            {"shot_index": 0, "subtitle": "第一句"},
            {"shot_index": 1, "subtitle": "第二句"},
        ]

        subtitles = build_subtitles(shots, [4.25, 5.75])

        self.assertEqual(
            subtitles,
            [
                {"shot_index": 0, "text": "第一句", "start_s": 0.0, "end_s": 4.25},
                {"shot_index": 1, "text": "第二句", "start_s": 4.25, "end_s": 10.0},
            ],
        )

    def test_payload_requires_precompose_assets(self):
        payload = {
            "job": {"id": "job-1", "aspect_ratio": "9:16", "voiceover": None},
            "shots": [{"shot_index": 0, "video_url": "https://example.com/a.mp4"}],
        }

        with self.assertRaisesRegex(ComposeWorkerError, "voiceover"):
            validate_payload(payload)


if __name__ == "__main__":
    unittest.main()

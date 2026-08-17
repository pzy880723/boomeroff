from __future__ import annotations

import unittest
from pathlib import Path

from worker.storefront_lock import resolve_storefront_reference


class StorefrontLockTests(unittest.TestCase):
    def test_resolves_only_explicit_storefront_reference(self) -> None:
        job = {
            "script": {
                "__render_payload": {
                    "reference_manifest": [
                        {
                            "role": "scene",
                            "url": "https://cdn.example.com/interior.jpg",
                        },
                        {
                            "role": "storefront",
                            "url": "https://cdn.example.com/real-storefront.jpg",
                        },
                    ]
                }
            }
        }

        self.assertEqual(
            resolve_storefront_reference(job),
            "https://cdn.example.com/real-storefront.jpg",
        )

    def test_does_not_guess_storefront_from_first_image(self) -> None:
        job = {
            "script": {
                "__render_payload": {
                    "reference_manifest": [
                        {
                            "role": "scene",
                            "url": "https://cdn.example.com/interior.jpg",
                        }
                    ]
                }
            }
        }

        self.assertIsNone(resolve_storefront_reference(job))


if __name__ == "__main__":
    unittest.main()

import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

# Keep tests self-contained even if requests isn't installed.
if "requests" not in sys.modules:
    sys.modules["requests"] = SimpleNamespace(
        get=lambda *args, **kwargs: None,
        head=lambda *args, **kwargs: None,
        RequestException=Exception,
    )

import fetch_versions as fv


class FetchVersionsTests(unittest.TestCase):
    def test_list_stable_for_majors_filters_and_sorts(self):
        all_versions = [
            "8.24.25281.15001",
            "8.24.25282.10001",
            "7.31.25281.15001",
            "8.24.25281.15001-beta",
            "6.10.20100.10001",
        ]

        stable = fv.list_stable_for_majors(all_versions, [7, 8])

        self.assertEqual(
            stable,
            ["8.24.25282.10001", "8.24.25281.15001", "7.31.25281.15001"],
        )

    def test_decode_version_date(self):
        # yyddd = 25281 -> 2025 day 281 = 2025-10-08
        date = fv.decode_version_date("8.24.25281.15001")
        self.assertEqual(date, dt.date(2025, 10, 8))

    def test_build_windows_url(self):
        date = dt.date(2025, 10, 8)
        url = fv.build_windows_url("8.24.25281.15001", date, "en-us")
        self.assertEqual(
            url,
            "https://files.mcneel.com/dujour/exe/20251008/rhino_en-us_8.24.25281.15001.exe",
        )

    def test_build_mac_url_candidates(self):
        urls = fv.build_mac_url_candidates("8.25.25328.11001")
        self.assertEqual(
            urls,
            [
                "https://files.mcneel.com/rhino/8/mac/releases/rhino_8.25.25328.11001.dmg",
                "https://files.mcneel.com/rhino/8/mac/releases/rhino_8.25.25328.11002.dmg",
            ],
        )

    @patch("fetch_versions.requests.get")
    def test_versions_from_registration_fetches_nested_pages(self, mock_get):
        page_response = Mock()
        page_response.raise_for_status.return_value = None
        page_response.json.return_value = {
            "items": [
                {"catalogEntry": {"version": "8.24.25281.15001"}},
                {"catalogEntry": {"version": "7.31.25281.15001"}},
            ]
        }
        mock_get.return_value = page_response

        reg_json = {"items": [{"@id": "https://example.test/page-1.json", "items": None}]}

        versions = fv.versions_from_registration(reg_json)

        self.assertEqual(versions, ["8.24.25281.15001", "7.31.25281.15001"])
        mock_get.assert_called_once()

    def test_prepend_latest_and_write_all(self):
        with tempfile.TemporaryDirectory() as tmp:
            md_latest = Path(tmp) / "latest.md"
            md_all = Path(tmp) / "all.md"

            changed = fv.prepend_latest(
                str(md_latest),
                "rhino_en-us_8.24.25281.15001.exe",
                "https://files.mcneel.com/dujour/exe/20251008/rhino_en-us_8.24.25281.15001.exe",
            )
            self.assertTrue(changed)

            # Duplicate should not be added again
            changed_again = fv.prepend_latest(
                str(md_latest),
                "rhino_en-us_8.24.25281.15001.exe",
                "https://files.mcneel.com/dujour/exe/20251008/rhino_en-us_8.24.25281.15001.exe",
            )
            self.assertFalse(changed_again)

            count = fv.write_all(
                str(md_all),
                [
                    ("rhino_en-us_8.24.25281.15001.exe", "https://example.test/win.exe"),
                    ("rhino_8.24.25281.15002.dmg", "https://example.test/mac.dmg"),
                ],
            )
            self.assertEqual(count, 2)
            self.assertTrue(md_all.read_text(encoding="utf-8").strip().startswith("- [rhino_en-us_8.24.25281.15001.exe]"))

    @patch("fetch_versions.fetch_registration_index")
    @patch("fetch_versions.versions_from_registration")
    @patch("fetch_versions.list_stable_for_majors")
    def test_get_stable_versions_orchestration(self, mock_list_stable, mock_versions_from_reg, mock_fetch_reg):
        mock_fetch_reg.return_value = {"some": "data"}
        mock_versions_from_reg.return_value = ["v1", "v2"]
        mock_list_stable.return_value = ["v1"]

        stable = fv.get_stable_versions()

        mock_fetch_reg.assert_called_once()
        mock_versions_from_reg.assert_called_once_with({"some": "data"})
        mock_list_stable.assert_called_once_with(["v1", "v2"], fv.MAJORS)
        self.assertEqual(stable, ["v1"])


if __name__ == "__main__":
    unittest.main()

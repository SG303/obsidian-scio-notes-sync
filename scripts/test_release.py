"""Regression checks for release guards and source archive isolation."""
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

from package import SOURCE_FILES, package
from release import check, prepare


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name, data in {
            "manifest.json": {"version": "0.1.0", "minAppVersion": "1.8.7"},
            "package.json": {"version": "0.1.0"},
            "package-lock.json": {"version": "0.1.0", "packages": {"": {"version": "0.1.0"}}},
            "versions.json": {"0.1.0": "1.8.7"},
        }.items():
            (self.root / name).write_text(json.dumps(data))
        (self.root / "CHANGELOG.md").write_text("# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Import notes.\n")

    def test_first_release_keeps_version_and_requires_dated_notes_before_tagging(self):
        self.assertEqual(check(self.root), "0.1.0")
        with self.assertRaises(ValueError):
            check(self.root, "0.1.0")
        prepare(self.root, "0.1.0")
        self.assertIn("Import notes", check(self.root, "0.1.0"))
        with self.assertRaises(ValueError):
            check(self.root, "v0.1.0")

    def test_new_version_updates_every_metadata_file_and_preserves_history(self):
        prepare(self.root, "0.1.0")
        path = self.root / "CHANGELOG.md"
        path.write_text(path.read_text().replace("## [Unreleased]", "## [Unreleased]\n\n### Fixed\n\n- Keep edits."))
        prepare(self.root, "0.1.1")
        self.assertIn("Keep edits", check(self.root, "0.1.1"))
        self.assertIn("Import notes", path.read_text())
        versions = json.loads((self.root / "versions.json").read_text())
        self.assertEqual(versions, {"0.1.0": "1.8.7", "0.1.1": "1.8.7"})

    def test_invalid_versions_leave_inputs_untouched(self):
        before = {p: p.read_bytes() for p in self.root.iterdir()}
        for value in ("v0.1.0", "0.0.9", "0.2.0-beta", "00.2.0"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                prepare(self.root, value)
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.iterdir()})

    def test_drift_in_package_or_compatibility_mapping_is_rejected(self):
        (self.root / "versions.json").write_text('{"0.1.0": "1.0.0"}')
        with self.assertRaises(ValueError):
            check(self.root)
        (self.root / "versions.json").write_text('{"0.1.0": "1.8.7"}')
        (self.root / "package.json").write_text('{"version": "0.2.0"}')
        with self.assertRaises(ValueError):
            check(self.root)

    def test_empty_notes_and_repeated_release_preparation_are_rejected(self):
        prepare(self.root, "0.1.0")
        for value in ("0.1.0", "0.1.1"):
            with self.assertRaises(ValueError):
                prepare(self.root, value)

    def test_source_archive_contains_project_files_but_no_runtime_data(self):
        for name in SOURCE_FILES:
            if not (self.root / name).exists():
                (self.root / name).write_text("project file")
        for name in ("src/main.ts", ".github/workflows/checks.yml", "node_modules/secret.ts", "data.json", ".env", "scripts/__pycache__/release.pyc"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("test fixture")
        with ZipFile(package(self.root, source=True)) as archive:
            names = archive.namelist()
            self.assertIn("obsidian-scio-notes-sync/src/main.ts", names)
            self.assertIn("obsidian-scio-notes-sync/.github/workflows/checks.yml", names)
            self.assertFalse(any("secret" in name or "data.json" in name or ".env" in name or "__pycache__" in name for name in names))


if __name__ == "__main__":
    unittest.main()

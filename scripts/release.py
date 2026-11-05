"""Prepare and validate standalone plugin releases without publishing anything."""
import argparse
from datetime import date
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SEMVER = r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
HEADERS = re.compile(r"^## \[(" + SEMVER + r")\] - (\d{4}-\d{2}-\d{2})$", re.M)


def version_tuple(value):
    if not re.fullmatch(SEMVER, value):
        raise ValueError("Use X.Y.Z without a v prefix, leading zeroes or prerelease suffixes.")
    return tuple(map(int, value.split(".")))


def section(changelog, header):
    if changelog.count(header) != 1:
        raise ValueError(f"Expected exactly one {header} section.")
    return re.split(r"^## ", changelog.split(header, 1)[1], maxsplit=1, flags=re.M)[0].strip()


def release_notes(changelog, version):
    header = next((h for h in HEADERS.finditer(changelog) if h[1] == version), None)
    if header is None:
        raise ValueError(f"Missing dated changelog section for {version}.")
    date.fromisoformat(header[2])
    notes = section(changelog, header[0])
    if not re.sub(r"^### .*?$", "", notes, flags=re.M).strip():
        raise ValueError("Release notes must contain more than headings.")
    return notes


def check(root, tag=None):
    manifest = json.loads((root / "manifest.json").read_text())
    version = manifest["version"]
    version_tuple(version)
    package = json.loads((root / "package.json").read_text())
    lock = json.loads((root / "package-lock.json").read_text())
    versions = json.loads((root / "versions.json").read_text())
    if any(value != version for value in (package["version"], lock["version"], lock["packages"][""]["version"])):
        raise ValueError("Manifest, package and lockfile versions must match.")
    if versions.get(version) != manifest["minAppVersion"]:
        raise ValueError("versions.json must map the current version to minAppVersion.")
    changelog = (root / "CHANGELOG.md").read_text()
    section(changelog, "## [Unreleased]")
    headers = list(HEADERS.finditer(changelog))
    if headers and headers[0][1] != version:
        raise ValueError("The newest changelog release must match the manifest version.")
    if tag is not None:
        if tag != version:
            raise ValueError(f"The Obsidian release tag must be exactly {version}.")
        return release_notes(changelog, version)
    return version


def prepare(root, version):
    current = check(root)
    requested = version_tuple(version)
    changelog = (root / "CHANGELOG.md").read_text()
    # The first public release may use the existing private plugin version.
    if requested < version_tuple(current) or (requested == version_tuple(current) and HEADERS.search(changelog)):
        raise ValueError("The release version must increase after the first release is prepared.")
    marker = "## [Unreleased]"
    updated = changelog.replace(marker, f"{marker}\n\n## [{version}] - {date.today().isoformat()}", 1)
    release_notes(updated, version)  # Validate before touching any metadata.
    for name in ("manifest.json", "package.json", "package-lock.json"):
        path = root / name
        data = json.loads(path.read_text())
        data["version"] = version
        if "packages" in data:
            data["packages"][""]["version"] = version
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    path = root / "versions.json"
    versions = json.loads(path.read_text())
    versions[version] = json.loads((root / "manifest.json").read_text())["minAppVersion"]
    path.write_text(json.dumps(versions, indent=2) + "\n")
    (root / "CHANGELOG.md").write_text(updated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare").add_argument("version")
    commands.add_parser("check").add_argument("--tag")
    commands.add_parser("notes").add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            prepare(ROOT, args.version)
        elif args.command == "check":
            check(ROOT, args.tag)
        else:
            version = json.loads((ROOT / "manifest.json").read_text())["version"]
            args.output.write_text(check(ROOT, version) + "\n")
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Release validation failed: {error}\n")


if __name__ == "__main__":
    main()

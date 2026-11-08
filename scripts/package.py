"""Create local plugin or source archives; never publish or access a vault."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "obsidian-scio-notes-sync"
SOURCE_FILES = (
    ".gitignore", ".nvmrc", ".editorconfig", "AGENTS.md", "CLAUDE.md", "README.md", "RELEASING.md",
    "CHANGELOG.md", "LICENSE", "manifest.json", "versions.json", "package.json",
    "package-lock.json", "tsconfig.json", "eslint.config.mjs", "build.mjs",
)


def package(root, source=False):
    destination = root / "dist" / (f"{REPOSITORY}-source.zip" if source else "scio-notes.zip")
    if source:
        files = [root / name for name in SOURCE_FILES]
        for folder in ("src", "tests", "scripts", ".github"):
            files.extend(path for path in (root / folder).rglob("*")
                         if path.suffix in (".ts", ".py", ".yml") and path.is_file())
        prefix = REPOSITORY
        base = root
    else:
        base = root / "dist/scio-notes"
        files = [base / name for name in ("main.js", "manifest.json", "README.md", "LICENSE")]
        prefix = "scio-notes"
    # Validate the entire input before replacing an existing archive.
    if any(not path.is_file() or path.is_symlink() for path in files):
        raise ValueError("Missing or symlinked archive input; build/check the project first.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, f"{prefix}/{path.relative_to(base).as_posix()}")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="store_true")
    args = parser.parse_args()
    print(package(ROOT, args.source))

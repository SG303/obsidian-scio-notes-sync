# Agent instructions

Read this file and `RELEASING.md` before making changes. This project is the
standalone **obsidian-scio-notes-sync** repository. While it is staged inside
Scio, the parent project's instructions also apply.

## Scope and implementation

- Import Scio lecture notes and images into Obsidian on desktop and Android.
  Scio is the source. Use GET requests only; never upload edits or propagate
  server deletions into the vault.
- State assumptions before coding. Keep changes small and directly related to
  the request. Do not refactor adjacent code or add dependencies without need.
- Runtime code uses Obsidian and browser APIs only. Node.js is limited to build
  and test scripts. Use `requestUrl` for networking and the Vault API for files.
- Keep local-edit baselines and atomic content checks. Never overwrite local
  edits or untracked files. Use `FileManager.renameFile` for tracked renames.
- Keep plugin ID `scio-notes` stable, including existing settings and baselines
  in `data.json`. Repository names and plugin IDs are independent.
- All UI text, documentation, commits, PRs and release notes are in English.
  Conversation with the owner may be in German.

## Verification and workflow

- Node.js 22.13+ and Python 3.10+ are required for development. Use `npm ci`.
- `npm run check` runs TypeScript, official Obsidian lint rules, sync tests,
  version consistency and Python release/export tests. Never commit with a
  failing available check.
- `npm run package` also builds and creates `dist/scio-notes.zip`.
- `npm run export` produces a source archive for creating the standalone repo;
  it must contain no vault data, credentials, dependencies or Git history.
- The optional lint recommendation to adopt Obsidian 1.13 declarative settings
  is not a compatibility error: the current settings UI intentionally supports
  Obsidian 1.8.7. Do not raise the minimum version solely to remove that warning.
- Test new behavior with focused regressions. Provide a one-line click test
  the owner can perform in Obsidian. Do not claim unperformed device tests.
- Use Conventional Commits. One commit represents one logical change. Prepare
  release changes in a PR to `main` as `chore: release X.Y.Z`.
- Document relevant changes under `## [Unreleased]` in `CHANGELOG.md`. The
  authoritative plugin version is `manifest.json`; use the release helper to
  synchronize package files and `versions.json`. Scio's app version is separate.
- Publish tags/releases and submit to the community directory only on explicit
  request. Never rewrite existing tags or published release artifacts.

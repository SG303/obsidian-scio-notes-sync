# Changelog

All notable changes to Scio Notes are documented here in English.
Versions follow Semantic Versioning. This plugin is versioned independently
from the Scio application. Public releases are recorded in dated sections below.

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added

- One-way imports of Scio subject notes and images for offline reference.
- Manual sync, open/resume sync and configurable foreground polling.
- Local-edit protection, per-note retries and visible sync status.
- Desktop and Android installation instructions and sync regression tests.
- Title-only filenames, with ID suffixes only for occupied names, and safe
  migration of legacy filenames on the next sync.
- Standalone repository setup, Obsidian lint checks and explicit tag-triggered
  releases with individually downloadable plugin assets.

### Upgrade notes

- Keep the plugin ID `scio-notes` and retain `data.json` when updating an existing
  private installation. Server data and local annotations are never uploaded.
- Manual check: sync a saved note with an image, disconnect Scio and open both;
  reconnect, update the source and sync again; local edits must remain untouched.

### Validation

- The owner confirmed that the Android test of the updated plugin succeeded.
- Automated checks cover sync behavior, version consistency, archive isolation
  and builds. Desktop behavior has not been manually verified in Obsidian.

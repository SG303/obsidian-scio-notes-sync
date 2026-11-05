# Repository setup and release management

This is **SG303/obsidian-scio-notes-sync**. Pushing release tags and submitting
to the Obsidian directory are separate, explicit actions. Release preparation
alone publishes nothing. All GitHub content must be in English.

## Create the repository when authorized

1. Use the source archive `dist/obsidian-scio-notes-sync-source.zip` generated
   by `npm run export`. Extract its top-level folder to a separate location,
   outside the Scio checkout. It has no dependency on Scio's source tree.
2. Create an empty GitHub repository named `obsidian-scio-notes-sync` under
   `SG303`. Use public visibility for community distribution. Do not generate
   another README, license or `.gitignore`: these files are already included.
3. Add the extracted project files **at the repository root**, including hidden
   `.github/`, `.gitignore` and `.nvmrc`. Do not upload the enclosing folder,
   `node_modules`, `dist`, compiled `main.js`, `.obsidian` or `data.json`.
4. Use `main` as the default branch. The initial commit can be
   `feat: add Scio notes sync plugin`. Pushing `main` runs checks, without
   publishing anything. Enable branch protection requiring PRs and the
   workflow's `checks` job once it has run.
5. Verify that the homepage, author and repository metadata match the actual
   GitHub owner. `private: true` in `package.json` only prevents accidental npm
   publication; it does not make the GitHub repository private.

## Required local checks

From the standalone repository root:

```sh
npm ci
npm run package
npm run export
```

`npm run package` runs typechecking, Obsidian's recommended lint rules, sync
regressions, release consistency checks and Python tooling tests, then builds
the plugin and installable ZIP. `npm run build` alone creates root `main.js`
for Obsidian build verification, as well as installable files under `dist/`.
No Docker build is needed: this plugin is independent of Scio's deployment.

Perform the manual desktop and Android checks in `README.md` before publication.
The current automation does not launch Obsidian or an Android device. The owner
has confirmed the Android test of the updated plugin, including the filename
change. Desktop behavior has automated coverage but has not been manually
verified in Obsidian; do not present it as a completed manual test.

## Versions and changelog

- `manifest.json` is authoritative. `package.json`, both lockfile version
  fields and the current entry in `versions.json` must match.
- Use stable Semantic Versions (`X.Y.Z`); do not bump for every change. Keep
  relevant changes under `## [Unreleased]` until a release is requested.
- Tags are **`X.Y.Z`, without `v`**. Obsidian requires the exact manifest version
  as its release tag. This differs from the Scio app's `vX.Y.Z` tags.
- The initial release uses `0.1.0`, retaining compatibility with the private
  builds. Later releases must increase the version.

On a release branch, prepare the next version (only when requested), for example:

```sh
python3 scripts/release.py prepare 0.1.1
npm run package
python3 scripts/release.py check --tag 0.1.1
```

The helper synchronizes version files and dates the Unreleased notes. It creates
no commit, tag or release. Substitute the version chosen for the release.
Review the changes and merge the PR as `chore: release X.Y.Z` after checks pass.

## Publish only when requested

After the release PR has merged, check out and update `main`, verify a clean
working tree and run the local checks. Explicitly push a new annotated tag:

```sh
python3 scripts/release.py check --tag 0.1.1
git tag -a 0.1.1 -m 'Scio Notes 0.1.1'
git push origin 0.1.1
```

The **Plugin checks and release** workflow runs all checks and builds the
artifacts. Only its tag-triggered release job receives write permissions. It
validates the exact version, dated release notes and that the tagged commit is
on `main` before publishing a GitHub Release with separate `main.js`,
`manifest.json`, `LICENSE` and `scio-notes.zip` attachments. It uses the built-in
`GITHUB_TOKEN`; no personal token or additional secret is required.

Do not move/delete existing release tags or overwrite published assets. The
workflow deliberately has no clobber option. If a run fails, inspect its logs
before retrying. An existing release must be reviewed before retrying a create
step; code changes require a new version. Publish versions in increasing order.

## Submit to the community directory

After a successful public release:

1. Confirm `manifest.json`, `README.md` and `LICENSE` are at the HEAD of the
   default branch and release attachments are accessible individually.
2. Confirm `scio-notes` is available as an ID before first submission. If a
   conflicting published ID exists, plan an explicit migration for private
   users; never silently change the installed ID.
3. Sign in to [community.obsidian.md](https://community.obsidian.md), connect
   the repository owner's GitHub account and add the repository URL.
4. Review the disclosures, maintenance responsibility and submission policies.
   Resolve scanner errors before publishing the directory entry. Future
   fixes use new releases rather than editing previously published assets.

Reference: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin),
[developer policies](https://docs.obsidian.md/community-directory/developer-policies),
and [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).

## Updating and recovery

Keep `data.json` when updating a private installation. If a plugin version
misbehaves, disable it, preserve notes and plugin state, and restore the previous
`main.js` and `manifest.json` from its release. Never reset the vault, delete
annotations or change Scio server data automatically. Back up the vault and
plugin state before testing migrations.

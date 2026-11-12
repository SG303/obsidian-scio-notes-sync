# Scio Notes for Obsidian

One-way sync from [Scio](https://github.com/SG303/scio) to an Obsidian vault on
**desktop and Android**, with Markdown notes and images available offline.
Scio remains the source. This plugin never creates, changes or deletes anything
on the Scio server and makes no AI calls. No Obsidian account or paid sync service
is required.

> [!NOTE]
> Personal project, built with AI coding agents under my supervision. Review the code carefully before you use it.

This is an independent community plugin, not an official Obsidian product.
Repository name: `obsidian-scio-notes-sync`. Installed plugin ID: `scio-notes`.
Install from [GitHub Releases](https://github.com/SG303/obsidian-scio-notes-sync/releases).
The plugin is not yet listed in Obsidian's Community plugins directory;
use the manual installation steps below.

## Requirements and privacy

- Obsidian 1.8.7 or later, with community plugins enabled.
- Your own running Scio instance with **Subjects → Lectures** and the lecture-note
  API. Development targets Scio 0.7.1; older versions have not been validated.
- Network access from the device to Scio, over LAN, Tailscale or your own HTTPS
  setup. Tailscale is optional; it is not provided by the plugin. No public
  exposure of your Scio server is required.
- Network requests are GET requests to **your configured Scio instance only**,
  to read subjects, notes and embedded Scio images. No notes or edits are uploaded.
- No analytics, telemetry, ads, AI calls or plugin-operated backend. No paid
  subscription is required by this plugin. Your chosen network/vault sync
  services may have separate terms or costs.
- Imported notes and images stay in your vault. The server address, settings,
  filenames, timestamps and SHA-256 baselines are saved in the plugin's local
  `data.json` using Obsidian's plugin storage. No files outside the vault are read
  or written by the plugin.
- Images hosted outside Scio are not downloaded. They retain their original
  external links; opening such a note may cause Obsidian to contact that host.

The plugin uses Obsidian's native HTTP API to reach private/LAN instances.
It implements no separate authentication. Keep access restricted to trusted
devices, as with your normal Scio installation.

## Install on Android

1. Install/open Obsidian and open the vault where you want your Scio notes.
   Use a vault stored in a folder accessible to your Android file manager.
2. Download [scio-notes.zip](https://github.com/SG303/obsidian-scio-notes-sync/releases/latest/download/scio-notes.zip)
   and extract it. It contains a `scio-notes` folder.
3. In your file manager, enable **Show hidden files**. Copy that folder into
   `<your vault>/.obsidian/plugins/` (create `plugins` if it does not exist).
   The resulting files must be `.obsidian/plugins/scio-notes/main.js` and
   `.obsidian/plugins/scio-notes/manifest.json`, without another nested folder.
   If your file manager cannot show hidden folders, connect the phone to a
   computer and copy the files there.
4. Restart Obsidian. Under **Settings → Community plugins**, enable community
   plugins if necessary, then enable **Scio Notes** in the installed plugins list.
5. If you use Tailscale, connect it **on your phone**. In the phone's browser,
   check that your usual Scio address opens over your chosen network connection.
6. Open **Settings → Scio Notes**. Enter that exact base address (for example
   `http://100.x.y.z:8001` or `https://your-scio.your-tailnet.ts.net`), without
   `/api` or a page path. Choose a vault folder, then tap **Save settings and sync**.

Use the same steps on desktop, with your computer's file manager. The minimum
Obsidian version is 1.8.7. The plugin uses Obsidian's networking and Vault APIs;
its runtime has no Node.js, Electron or filesystem dependencies. iOS is not a
tested target for this version.

The owner has confirmed the Android test of the updated plugin, including the
filename change. Desktop behavior has automated coverage but has not yet been
manually verified in Obsidian.

## Update an existing installation

1. Disable **Scio Notes** under **Settings → Community plugins**.
2. Download and extract the latest `scio-notes.zip` from GitHub Releases.
3. Replace `main.js` and `manifest.json` in your existing `scio-notes` plugin
   folder. Keep `data.json`: it contains your settings and sync baselines.
4. Enable the plugin again and select **Sync now** in its settings.

Do not delete the existing plugin folder or replace it with an empty folder.
Community-directory installation and updates are not available yet.

## Daily use

- Open the **Scio** folder. Notes appear under `<Subject title> (<ID>)`, with
  filenames such as `Cell division.md`. A note ID is added to the filename only
  when that name is already occupied in the subject folder; the ID always stays
  in the note's properties for sync. Embedded Scio images are copied to
  `Scio/attachments/` and linked locally, so both text and images work offline.
  External images hosted outside Scio remain external links.
- Use the refresh ribbon icon, **Scio Notes: Sync notes now** in the command
  palette, or **Sync now** in plugin settings for a manual refresh.
- By default, sync runs on open/resume and every five minutes while Obsidian is
  active. Set the interval to `0` and disable open/resume sync for manual-only use.
  Android can suspend Obsidian in the background: there is no background service.
- **Scio Notes: Show sync status** and plugin settings show the last complete
  sync, skipped files and connection/download errors. Successful notes are kept
  if another note fails; the next sync retries unfinished notes and missing images.
- Scio title and subject-name changes update the Markdown heading/properties.
  Existing filenames/folders remain stable, avoiding broken references.
- On the first sync after upgrading from an early private build, unedited legacy
  imports such as `Cell division (12).md` are renamed to `Cell division.md` when that name is
  free. The rename uses Obsidian's file manager, which respects its automatic
  link-update setting. Locally edited files and occupied target names are kept.
- Only notes saved on the Scio server are imported. A draft that has not reached
  the server cannot be read by the plugin.

## Protecting your vault

- Modified local notes are **skipped**, with a visible warning; they are never
  silently overwritten or uploaded. There is no automatic merge. To import a
  fresh version, first **copy** your edited note outside the Scio folder, then
  delete the imported file and sync again. Keep your own annotations in separate
  notes and link to the imported files for the simplest workflow.
- Notes deleted in Scio remain in the vault. A locally deleted imported note is
  recreated on the next sync if it still exists in Scio.
- Existing files without a matching saved baseline are never overwritten.
- SHA-256 baselines and per-note progress live in
  `.obsidian/plugins/scio-notes/data.json`. Keep this file when updating the
  plugin; follow [Update an existing installation](#update-an-existing-installation).
- Renames inside Obsidian are tracked. Moves or edits outside Obsidian, especially
  through another vault sync tool, may cause a conflict or recreate the old path.
  Preserve the imported folder structure for predictable reference links.
- If another service already syncs this vault between devices, run automatic
  Scio imports on **one device** and let that service distribute the resulting
  files. Independent vaults can each run this plugin. Simultaneous imports into
  one shared vault and automatic recovery after deleting plugin state are outside
  the current version's scope.
- Scio address and target-folder combinations have separate baselines. Changing
  either does not delete old imports. If you change a server's address or restore
  a different Scio database, use a new target folder to avoid ID collisions.

## Build and package (maintainers)

From the repository root, with Node.js 22.13+, npm and Python 3.10+ installed:

```sh
npm ci
npm run package
npm run export
```

This typechecks, runs the official Obsidian lint rules and regression tests,
validates release metadata, bundles a browser-compatible
`main.js` with the Obsidian API kept external, and produces
`dist/scio-notes.zip`. It does not install into any vault or publish a release.
`npm run export` additionally creates a clean repository source archive under
`dist/obsidian-scio-notes-sync-source.zip`, including hidden GitHub workflow
files and excluding vault data, dependencies and Git history.

The plugin has its own version; it does not change Scio's app version. See
[RELEASING.md](RELEASING.md) for repository setup, explicit tag-based releases
and community submission. The root `main.js` generated by `npm run build` is
ignored by Git and uploaded separately as a release asset.

Obsidian's recommended linter currently suggests adopting the settings search
API introduced in 1.13. The existing settings UI deliberately remains compatible
with 1.8.7; this optional recommendation does not block installation or builds.

Manual acceptance check on desktop **and a real Android device**:

1. Create/save a Scio note with an image, sync, and open it from the subject folder.
2. Disconnect Tailscale and open the note/image again: both remain readable.
3. Change/save the note in Scio, reconnect and sync: the same file updates.
4. Edit the imported file in Obsidian, change Scio again and sync: the local
   edit stays intact and sync status names the skipped file.
5. Delete a note in Scio and sync: its local reference copy remains.
6. Background/resume Obsidian with Tailscale connected: open/resume sync catches
   up. Repeat without a connection and inspect the visible error/status.

Automated tests and a successful browser-target build do not replace these
real-device checks of Android networking, image rendering and lifecycle behavior.

## Status

Personal project, built with AI coding agents under my supervision. There is
no support and no stability guarantee; review the code carefully before you
rely on it. See [LICENSE](LICENSE) for the warranty terms.

## Support and license

Report issues through the repository's GitHub **Issues** tab.
Include the plugin version, Obsidian version, desktop/Android version, steps to
reproduce and the sync status message. Remove private note contents and your
Scio/Tailscale address from reports. Never attach the entire vault or `data.json`.

Licensed under the [MIT License](LICENSE), as is the original Scio project.
Build tools and API type declarations are development dependencies; the runtime
bundle has no third-party dependencies other than Obsidian's host API.

import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl } from 'obsidian';
import { Client, Note, NoteSummary, Subject, SyncState, Vault, errorMessage, serverUrl, syncNotes, targetFolder } from './sync';

interface Settings {
  server: string;
  folder: string;
  syncOnOpen: boolean;
  intervalMinutes: number;
}
interface Data {
  settings: Settings;
  sources: Record<string, SyncState>;
  lastSuccess: string;
  status: string;
  details: string[];
}
const defaults: Settings = { server: '', folder: 'Scio', syncOnOpen: true, intervalMinutes: 5 };

async function get(url: string) {
  let timer: number | undefined;
  try {
    const response = await Promise.race([
      requestUrl({ url, method: 'GET', throw: false }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Scio did not respond within 30 seconds. Check Tailscale and the server address.')), 30_000);
      }),
    ]);
    if (response.status !== 200) throw new Error(`Scio returned HTTP ${response.status}. Check the address and connection.`);
    return response;
  } catch (error) {
    throw new Error(`Unable to read Scio: ${errorMessage(error)}`);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function identity(value: unknown): value is Record<string, unknown> & { id: number } {
  return object(value) && Number.isSafeInteger(value.id) && (value.id as number) > 0;
}
function isSubject(value: unknown): value is Subject {
  return identity(value) && typeof value.title === 'string';
}
function isSummary(value: unknown): value is NoteSummary {
  return identity(value) && Number.isSafeInteger(value.subject_id) && typeof value.updated_at === 'string';
}
function isNote(value: unknown): value is Note {
  return isSummary(value) && object(value) && typeof value.title === 'string' && typeof value.content === 'string';
}
function checked<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw new Error('Unexpected Scio response. Check the server address and Scio version.');
  return value;
}

class ScioClient implements Client {
  constructor(private server: string) {}
  async subjects() {
    return checked((await get(`${this.server}/api/subjects`)).json,
      (value): value is Subject[] => Array.isArray(value) && value.every(isSubject));
  }
  async notes(subjectId: number) {
    return checked((await get(`${this.server}/api/subjects/${subjectId}/lectures`)).json,
      (value): value is NoteSummary[] => Array.isArray(value) && value.every(isSummary) && value.every(note => note.subject_id === subjectId));
  }
  async note(id: number) {
    return checked((await get(`${this.server}/api/lectures/${id}`)).json, isNote);
  }
  async image(path: string) {
    const response = await get(`${this.server}${path}`);
    const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
    if (!/^image\/(png|jpeg|gif|webp)(;|$)/i.test(type)) throw new Error('Scio returned an invalid image response.');
    return response.arrayBuffer;
  }
}

class ObsidianVault implements Vault {
  constructor(private app: App) {}
  async read(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file && !(file instanceof TFile)) throw new Error(`A folder occupies ${path}.`);
    return file instanceof TFile ? this.app.vault.read(file) : null;
  }
  exists(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFolder) throw new Error(`A folder occupies the file ${path}.`);
    return file !== null;
  }
  private async parent(path: string) {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      const existing = this.app.vault.getAbstractFileByPath(folder);
      if (existing && !(existing instanceof TFolder)) throw new Error(`A file occupies the folder ${folder}.`);
      if (!existing) await this.app.vault.createFolder(folder);
    }
  }
  async write(path: string, content: string, expected: string | null) {
    await this.parent(path);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (expected === null) {
      if (file) throw new Error(`File already exists; kept local copy: ${path}`);
      await this.app.vault.create(path, content);
    } else {
      if (!(file instanceof TFile)) throw new Error(`File moved during sync; try again: ${path}`);
      await this.app.vault.process(file, current => {
        if (current !== expected) throw new Error(`File changed during sync; kept local copy: ${path}`);
        return content;
      });
    }
  }
  async image(path: string, content: ArrayBuffer) {
    await this.parent(path);
    if (!this.exists(path)) await this.app.vault.createBinary(path, content);
  }
  async rename(path: string, target: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`File moved during sync; try again: ${path}`);
    if (this.app.vault.getAbstractFileByPath(target)) throw new Error(`File already exists; kept local copy: ${target}`);
    await this.app.fileManager.renameFile(file, target);
  }
}

class StatusModal extends Modal {
  constructor(app: App, private plugin: ScioNotes) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Scio sync status' });
    this.plugin.renderStatus(contentEl);
  }
  onClose() { this.contentEl.empty(); }
}

export default class ScioNotes extends Plugin {
  data!: Data;
  syncing = false;
  private stopped = false;
  private lastAttempt = 0;
  private statusBar!: HTMLElement;

  async onload() {
    const stored = await this.loadData() as Partial<Data> | null;
    this.data = {
      settings: { ...defaults, ...stored?.settings }, sources: stored?.sources ?? {},
      lastSuccess: stored?.lastSuccess ?? '', status: stored?.status ?? 'Not synced yet.', details: stored?.details ?? [],
    };
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText('Scio: ready');
    this.addRibbonIcon('refresh-cw', 'Sync Scio notes', () => { void this.sync(true); });
    this.addCommand({ id: 'sync-notes', name: 'Sync notes now', callback: () => { void this.sync(true); } });
    this.addCommand({ id: 'sync-status', name: 'Show sync status', callback: () => new StatusModal(this.app, this).open() });
    this.addSettingTab(new ScioSettings(this.app, this));
    // Track note renames made inside Obsidian instead of recreating the old file.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      let changed = false;
      for (const state of Object.values(this.data.sources)) {
        for (const entry of Object.values(state.entries)) {
          if (entry.path === oldPath || entry.path.startsWith(`${oldPath}/`)) {
            entry.path = file.path + entry.path.slice(oldPath.length);
            changed = true;
          }
          entry.images = entry.images.map(path => {
            if (path !== oldPath && !path.startsWith(`${oldPath}/`)) return path;
            changed = true;
            return file.path + path.slice(oldPath.length);
          });
        }
      }
      if (changed) void this.saveData(this.data).catch(error => new Notice(`Scio could not save the renamed path: ${errorMessage(error)}`));
    }));
    this.registerInterval(window.setInterval(() => {
      const minutes = this.data.settings.intervalMinutes;
      if (minutes > 0 && Date.now() - this.lastAttempt >= minutes * 60_000 && !activeDocument.hidden) void this.sync(false);
    }, 30_000));
    this.registerDomEvent(activeDocument, 'visibilitychange', () => {
      if (!activeDocument.hidden && this.data.settings.syncOnOpen && Date.now() - this.lastAttempt > 30_000) void this.sync(false);
    });
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped && this.data.settings.syncOnOpen) void this.sync(false);
    });
  }

  onunload() { this.stopped = true; }

  renderStatus(element: HTMLElement) {
    element.createEl('p', { text: this.syncing ? 'Sync in progress…' : this.data.status });
    element.createEl('p', { text: `Last complete sync: ${this.data.lastSuccess ? new Date(this.data.lastSuccess).toLocaleString() : 'Never'}` });
    if (this.data.details.length) {
      const list = element.createEl('ul');
      for (const detail of this.data.details) list.createEl('li', { text: detail });
      element.createEl('p', { text: 'Local edits are kept. To import a fresh copy, first copy your edited note outside the Scio folder, then delete the imported file and sync again. Files deleted in Scio are kept in your vault.' });
    }
  }

  async sync(manual: boolean) {
    if (this.stopped || this.syncing) {
      if (manual) new Notice('A Scio sync is already running.');
      return;
    }
    if (!this.data.settings.server) {
      if (manual) new Notice('Set your Scio address in Settings → Scio Notes first.');
      return;
    }
    this.syncing = true;
    this.lastAttempt = Date.now();
    this.statusBar.setText('Scio: syncing…');
    try {
      const server = serverUrl(this.data.settings.server);
      const folder = targetFolder(this.data.settings.folder);
      const key = JSON.stringify([server, folder]);
      const state = this.data.sources[key] ??= { entries: {} };
      const result = await syncNotes({
        server, folder, client: new ScioClient(server), vault: new ObsidianVault(this.app), state,
        save: () => this.saveData(this.data), cancelled: () => this.stopped,
      });
      this.data.status = `${result.updated} updated, ${result.unchanged} unchanged, ${result.conflicts.length} local edits skipped, ${result.errors.length} errors.`;
      this.data.details = [...result.conflicts.map(path => `Local edits kept: ${path}`), ...result.errors];
      if (!result.errors.length && !result.conflicts.length) this.data.lastSuccess = new Date().toISOString();
      await this.saveData(this.data);
      if (!this.stopped && (manual || this.data.details.length)) {
        new Notice(`Scio: ${this.data.status}${this.data.details.length ? ' Open “Scio Notes: Show sync status” for details.' : ''}`, 10_000);
        if (manual && this.data.details.length) new StatusModal(this.app, this).open();
      }
    } catch (error) {
      this.data.status = 'Sync incomplete. Your existing vault notes are kept.';
      this.data.details = [errorMessage(error)];
      if (!this.stopped) new Notice(`Scio: ${errorMessage(error)}`, 10_000);
      try { await this.saveData(this.data); }
      catch (saveError) { if (!this.stopped) new Notice(`Scio could not save sync status: ${errorMessage(saveError)}`); }
    } finally {
      this.syncing = false;
      if (!this.stopped) this.statusBar.setText(this.data.details.length ? 'Scio: needs attention' : 'Scio: up to date');
    }
  }
}

class ScioSettings extends PluginSettingTab {
  constructor(app: App, private plugin: ScioNotes) { super(app, plugin); }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('Connection and sync').setHeading();
    containerEl.createEl('p', { text: 'One-way sync for offline reading. Scio remains the source; nothing is uploaded. Connect Tailscale on this device before syncing.' });
    const settings = { ...this.plugin.data.settings };
    let interval = String(settings.intervalMinutes);
    new Setting(containerEl).setName('Scio address').setDesc('Base address including http:// or https://, without /api.').addText(text => {
      text.setPlaceholder('https://scio.example.ts.net').setValue(settings.server).onChange(value => { settings.server = value; });
    });
    new Setting(containerEl).setName('Vault folder').setDesc('New imports are grouped by subject. Existing filenames stay stable when Scio titles change.').addText(text => {
      text.setValue(settings.folder).onChange(value => { settings.folder = value; });
    });
    new Setting(containerEl).setName('Sync on open and resume').addToggle(toggle => {
      toggle.setValue(settings.syncOnOpen).onChange(value => { settings.syncOnOpen = value; });
    });
    new Setting(containerEl).setName('Sync interval in minutes').setDesc('1–60 while Obsidian is active. Set 0 to disable periodic sync.').addText(text => {
      text.inputEl.type = 'number';
      text.inputEl.min = '0';
      text.inputEl.max = '60';
      text.setValue(interval).onChange(value => { interval = value; });
    });
    new Setting(containerEl).addButton(button => button.setButtonText('Save settings and sync').setCta().onClick(async () => {
      if (this.plugin.syncing) { new Notice('Wait for the current sync to finish before changing settings.'); return; }
      try {
        settings.server = serverUrl(settings.server);
        settings.folder = targetFolder(settings.folder);
        const minutes = Number(interval);
        if (!interval.trim() || !Number.isInteger(minutes) || minutes < 0 || minutes > 60) throw new Error('Enter a sync interval from 0 to 60 minutes.');
        settings.intervalMinutes = minutes;
        this.plugin.data.settings = settings;
        await this.plugin.saveData(this.plugin.data);
        await this.plugin.sync(true);
        this.display();
      } catch (error) { new Notice(errorMessage(error), 10_000); }
    }));
    new Setting(containerEl).addButton(button => button.setButtonText('Sync now').onClick(async () => {
      await this.plugin.sync(true);
      this.display();
    }));
    this.plugin.renderStatus(containerEl);
  }
}

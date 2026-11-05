export interface Subject { id: number; title: string }
export interface NoteSummary { id: number; subject_id: number; updated_at: string }
export interface Note extends NoteSummary { title: string; content: string }
export interface Client {
  subjects(): Promise<Subject[]>;
  notes(subjectId: number): Promise<NoteSummary[]>;
  note(id: number): Promise<Note>;
  image(path: string): Promise<ArrayBuffer>;
}
export interface Vault {
  read(path: string): Promise<string | null>;
  exists(path: string): boolean;
  // Must compare the current content again immediately before writing.
  write(path: string, content: string, expected: string | null): Promise<void>;
  rename(path: string, target: string): Promise<void>;
  image(path: string, content: ArrayBuffer): Promise<void>;
}
export interface Entry {
  path: string;
  hash: string;
  updatedAt: string;
  subjectTitle: string;
  images: string[];
  filenameVersion?: 2;
}
export interface SyncState { entries: Record<string, Entry> }
export interface Result { updated: number; unchanged: number; conflicts: string[]; errors: string[] }

export function serverUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use the Scio base address, such as https://scio.example.ts.net (without /api).');
  }
  return url.origin;
}

export function targetFolder(value: string): string {
  const parts = value.trim().split('/');
  // eslint-disable-next-line no-control-regex -- Reject control characters in user-provided vault paths.
  if (parts.some(part => !part || part.startsWith('.') || /[\\:*?"<>|\u0000-\u001f]/.test(part) || part.trim() !== part)) {
    throw new Error('Choose a vault folder such as Scio or Learning/Scio; hidden and parent folders are not allowed.');
  }
  return parts.join('/');
}

function filename(value: string): string {
  // eslint-disable-next-line no-control-regex -- Strip filesystem control characters and Obsidian link delimiters.
  return value.replace(/[\\/:*?"<>|#[\]^\u0000-\u001f]/g, '-').replace(/\s+/g, ' ')
    .trim().replace(/^\.+|[. ]+$/g, '').slice(0, 80).trim() || 'Untitled';
}

function relativeLink(notePath: string, assetPath: string): string {
  const parent = notePath.split('/').slice(0, -1);
  const target = assetPath.split('/');
  while (parent.length && target.length && parent[0] === target[0]) {
    parent.shift();
    target.shift();
  }
  return [...parent.map(() => '..'), ...target].map(part => encodeURIComponent(part)).join('/');
}

export async function digest(content: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncNotes(options: {
  server: string; folder: string; client: Client; vault: Vault; state: SyncState;
  save: () => Promise<void>; cancelled?: () => boolean;
}): Promise<Result> {
  const { client, vault, state, save } = options;
  const server = serverUrl(options.server);
  const root = targetFolder(options.folder);
  const result: Result = { updated: 0, unchanged: 0, conflicts: [], errors: [] };
  const check = () => { if (options.cancelled?.()) throw new Error('Sync stopped.'); };
  const subjects = await client.subjects();
  for (const subject of subjects) {
    check();
    let notes: NoteSummary[];
    try { notes = await client.notes(subject.id); }
    catch (error) { result.errors.push(`${subject.title}: ${errorMessage(error)}`); continue; }
    for (const summary of notes) {
      check();
      try {
        const previous = state.entries[String(summary.id)];
        const current = previous ? await vault.read(previous.path) : null;
        if (previous && current !== null && await digest(current) !== previous.hash) {
          result.conflicts.push(previous.path);
          continue;
        }
        let renamed = false;
        if (previous && previous.filenameVersion !== 2) {
          // Migrate the old generated suffix once; leave custom filenames alone.
          const suffix = ` (${summary.id}).md`;
          const target = previous.path.endsWith(suffix) ? `${previous.path.slice(0, -suffix.length)}.md` : previous.path;
          if (target !== previous.path && !vault.exists(target)) {
            check();
            if (current !== null) await vault.rename(previous.path, target);
            previous.path = target;
            renamed = current !== null;
          }
          previous.filenameVersion = 2;
          await save();
        }
        if (previous && current !== null && previous.updatedAt === summary.updated_at && previous.subjectTitle === subject.title &&
            previous.images.every(path => vault.exists(path))) {
          if (renamed) result.updated++;
          else result.unchanged++;
          continue;
        }
        const note = await client.note(summary.id);
        if (note.id !== summary.id || note.subject_id !== subject.id) throw new Error('Unexpected note identity from Scio.');
        const base = `${root}/${filename(subject.title)} (${subject.id})/${filename(note.title)}`;
        const path = previous?.path ?? (vault.exists(`${base}.md`) ? `${base} (${note.id}).md` : `${base}.md`);
        // Never adopt/overwrite an existing file without a saved baseline, even after a crash.
        if (!previous && vault.exists(path)) {
          result.conflicts.push(path);
          continue;
        }
        // Restrict downloads to Scio's immutable image endpoints, including absolute URLs.
        const imagePattern = /(?:https?:\/\/[^\s<>"'()]+)?\/api\/lectures\/\d+\/images\/[0-9a-f]{32}\.(?:png|jpg|gif|webp)\b/g;
        const replacements = new Map<string, string>();
        const images: string[] = [];
        for (const match of note.content.matchAll(imagePattern)) {
          const original = match[0];
          if (replacements.has(original)) continue;
          const url = new URL(original, server);
          if (url.origin !== server) continue;
          const imagePath = `${root}/attachments/${url.pathname.split('/').slice(3).join('-')}`;
          if (!vault.exists(imagePath)) {
            const data = await client.image(url.pathname);
            check();
            await vault.image(imagePath, data);
          }
          images.push(imagePath);
          replacements.set(original, relativeLink(path, imagePath));
        }
        const body = note.content.replace(imagePattern, original => replacements.get(original) ?? original);
        const content = [
          '---', `scio_source: ${JSON.stringify(server)}`, `scio_lecture_id: ${note.id}`,
          `scio_subject_id: ${subject.id}`, `scio_subject: ${JSON.stringify(subject.title)}`,
          `scio_title: ${JSON.stringify(note.title)}`, `scio_updated_at: ${JSON.stringify(note.updated_at)}`,
          '---', '', `# ${note.title.replace(/[\r\n]/g, ' ')}`, '', body, '',
        ].join('\n');
        const hash = await digest(content);
        check();
        await vault.write(path, content, current);
        state.entries[String(note.id)] = { path, hash, updatedAt: note.updated_at, subjectTitle: subject.title, images, filenameVersion: 2 };
        // Keep successful progress if a later note or image cannot be downloaded.
        await save();
        result.updated++;
      } catch (error) {
        result.errors.push(`Note ${summary.id}: ${errorMessage(error)}`);
      }
    }
  }
  return result;
}

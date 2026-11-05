import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, Note, SyncState, Vault, digest, serverUrl, syncNotes, targetFolder } from '../src/sync';

const server = 'http://100.64.0.1:8001';
const imageName = `${'a'.repeat(32)}.png`;
const imageUrl = `/api/lectures/12/images/${imageName}`;
const imagePath = `Scio/attachments/12-images-${imageName}`;
const notePath = 'Scio/Biology (3)/Cells.md';
const legacyPath = 'Scio/Biology (3)/Cells (12).md';

function fixture() {
  const files = new Map<string, string>();
  const images = new Map<string, ArrayBuffer>();
  const state: SyncState = { entries: {} };
  const subjects = [{ id: 3, title: 'Biology' }];
  const notes: Note[] = [{ id: 12, subject_id: 3, title: 'Cells', content: 'Cell notes', updated_at: '2026-11-05T10:00:00' }];
  const calls = { note: 0, image: 0, save: 0, write: 0 };
  const hooks: { note?: () => void; image?: () => void; save?: () => void } = {};
  const client: Client = {
    async subjects() { return subjects; },
    async notes(id) { return notes.filter(note => note.subject_id === id).map(note => ({ ...note })); },
    async note(id) {
      calls.note++;
      hooks.note?.();
      return { ...notes.find(note => note.id === id)! };
    },
    async image() { calls.image++; hooks.image?.(); return new Uint8Array([1, 2, 3]).buffer; },
  };
  const vault: Vault = {
    async read(path) { return files.get(path) ?? null; },
    exists(path) { return files.has(path) || images.has(path); },
    async write(path, content, expected) {
      assert.equal(files.get(path) ?? null, expected, 'concurrent local edit must not be overwritten');
      calls.write++;
      files.set(path, content);
    },
    async image(path, content) { images.set(path, content); },
    async rename(path, target) {
      assert.ok(files.has(path));
      assert.ok(!files.has(target));
      files.set(target, files.get(path)!);
      files.delete(path);
    },
  };
  const run = () => syncNotes({ server, folder: 'Scio', client, vault, state, save: async () => {
    calls.save++;
    hooks.save?.();
  } });
  return { files, images, state, subjects, notes, calls, hooks, client, vault, run };
}

test('imports Markdown, properties and local images; unchanged notes do not refetch', async () => {
  const f = fixture();
  f.notes[0].content = `![diagram](${imageUrl})\n\n**Keep Markdown**`;
  assert.equal((await f.run()).updated, 1);
  const content = f.files.get(notePath)!;
  assert.ok(content.includes(`![diagram](../attachments/12-images-${imageName})`));
  assert.ok(content.includes('**Keep Markdown**'));
  assert.ok(content.includes('scio_lecture_id: 12'));
  assert.equal(f.images.size, 1);
  assert.equal(f.state.entries['12'].hash, await digest(content));
  assert.equal((await f.run()).unchanged, 1);
  assert.deepEqual(f.calls, { note: 1, image: 1, save: 1, write: 1 });
});

test('updates the same file when Scio renames a note or subject', async () => {
  const f = fixture();
  await f.run();
  f.notes[0].title = 'Renamed cells';
  f.notes[0].content = 'New content';
  f.notes[0].updated_at = 'later';
  f.subjects[0].title = 'New biology';
  assert.equal((await f.run()).updated, 1);
  assert.equal(f.files.size, 1);
  assert.ok(f.files.get(notePath)!.includes('# Renamed cells'));
  assert.ok(f.files.get(notePath)!.includes('scio_subject: "New biology"'));
});

test('keeps local edits even when Scio changed too', async () => {
  const f = fixture();
  await f.run();
  f.files.set(notePath, 'My annotation');
  f.notes[0].content = 'Changed on server';
  f.notes[0].updated_at = 'later';
  const result = await f.run();
  assert.deepEqual(result.conflicts, [notePath]);
  assert.equal(f.files.get(notePath), 'My annotation');
  assert.equal(f.calls.note, 1);
});

test('refreshes subject metadata even when the note timestamp did not change', async () => {
  const f = fixture();
  await f.run();
  f.subjects[0].title = 'Renamed biology';
  assert.equal((await f.run()).updated, 1);
  assert.equal(f.files.size, 1);
  assert.ok(f.files.get(notePath)!.includes('scio_subject: "Renamed biology"'));
});

test('detects edits made while waiting for the server', async () => {
  const f = fixture();
  await f.run();
  f.notes[0].updated_at = 'later';
  f.hooks.note = () => f.files.set(notePath, 'Edited during download');
  const result = await f.run();
  assert.equal(result.errors.length, 1);
  assert.equal(f.files.get(notePath), 'Edited during download');
  assert.equal(f.state.entries['12'].updatedAt, '2026-11-05T10:00:00');
});

test('never overwrites an existing file without a baseline', async () => {
  const f = fixture();
  f.files.set(notePath, 'An existing note');
  f.files.set(legacyPath, 'Another existing note');
  assert.deepEqual((await f.run()).conflicts, [legacyPath]);
  assert.equal(f.calls.write, 0);
  assert.equal(f.files.get(notePath), 'An existing note');
});

test('adds a suffix only for a real filename collision and keeps that name stable', async () => {
  const f = fixture();
  f.notes.push({ ...f.notes[0], id: 13 });
  assert.equal((await f.run()).updated, 2);
  assert.ok(f.files.has(notePath));
  const duplicate = 'Scio/Biology (3)/Cells (13).md';
  assert.ok(f.files.has(duplicate));
  assert.equal((await f.run()).unchanged, 2);
  f.files.delete(notePath);
  f.notes.shift();
  assert.equal((await f.run()).unchanged, 1);
  assert.ok(f.files.has(duplicate));
});

test('preserves an unrelated file with the same title', async () => {
  const f = fixture();
  f.files.set(notePath, 'My own note');
  assert.equal((await f.run()).updated, 1);
  assert.equal(f.files.get(notePath), 'My own note');
  assert.ok(f.files.get(legacyPath)!.includes('scio_lecture_id: 12'));
});

async function legacyFixture() {
  const f = fixture();
  await f.run();
  await f.vault.rename(notePath, legacyPath);
  f.state.entries['12'].path = legacyPath;
  delete f.state.entries['12'].filenameVersion;
  return f;
}

test('migrates an unchanged legacy filename without refetching or creating duplicates', async () => {
  const f = await legacyFixture();
  const content = f.files.get(legacyPath);
  assert.equal((await f.run()).updated, 1);
  assert.equal(f.files.get(notePath), content);
  assert.ok(!f.files.has(legacyPath));
  assert.equal(f.state.entries['12'].path, notePath);
  assert.equal(f.files.size, 1);
  assert.equal(f.calls.note, 1);
  assert.equal((await f.run()).unchanged, 1);
});

test('legacy migration keeps local edits and occupied target files', async () => {
  const f = await legacyFixture();
  f.files.set(notePath, 'My separate reference');
  assert.equal((await f.run()).unchanged, 1);
  assert.equal(f.files.get(notePath), 'My separate reference');
  assert.ok(f.files.has(legacyPath));
  delete f.state.entries['12'].filenameVersion;
  f.files.delete(notePath);
  f.files.set(legacyPath, 'Local edit');
  assert.deepEqual((await f.run()).conflicts, [legacyPath]);
  assert.ok(!f.files.has(notePath));
  assert.equal(f.files.get(legacyPath), 'Local edit');
});

test('failed legacy rename leaves its old path and baseline available for retry', async () => {
  const f = await legacyFixture();
  const rename = f.vault.rename;
  f.vault.rename = async () => { throw new Error('Rename failed'); };
  assert.equal((await f.run()).errors.length, 1);
  assert.equal(f.state.entries['12'].path, legacyPath);
  assert.equal(f.state.entries['12'].filenameVersion, undefined);
  f.vault.rename = rename;
  assert.equal((await f.run()).updated, 1);
  assert.ok(f.files.has(notePath));
});

test('migration preserves a title that itself ends with its note ID', async () => {
  const f = fixture();
  f.notes[0].title = 'Cells (12)';
  await f.run();
  assert.ok(f.files.has(legacyPath));
  assert.equal((await f.run()).unchanged, 1);
  assert.ok(f.files.has(legacyPath));
  assert.ok(!f.files.has(notePath));
});

test('missing images are retried without discarding previous progress', async () => {
  const f = fixture();
  f.notes.push({ ...f.notes[0], id: 13, title: 'Another note', content: `![diagram](${imageUrl})` });
  f.hooks.image = () => { throw new Error('Disconnected'); };
  const failed = await f.run();
  assert.equal(failed.updated, 1);
  assert.equal(failed.errors.length, 1);
  assert.equal(f.state.entries['13'], undefined);
  assert.equal(f.files.size, 1);
  f.hooks.image = undefined;
  const retried = await f.run();
  assert.equal(retried.unchanged, 1);
  assert.equal(retried.updated, 1);
  assert.equal(f.files.size, 2);
  assert.equal(f.images.size, 1);
});

test('repairs a deleted cached image even if the note is unchanged', async () => {
  const f = fixture();
  f.notes[0].content = `![diagram](${imageUrl})`;
  await f.run();
  f.images.delete(imagePath);
  assert.equal((await f.run()).updated, 1);
  assert.ok(f.images.has(imagePath));
  assert.equal(f.calls.image, 2);
});

test('keeps server-deleted notes and recreates locally deleted imports', async () => {
  const f = fixture();
  await f.run();
  const note = f.notes.pop()!;
  await f.run();
  assert.ok(f.files.has(notePath));
  f.notes.push(note);
  f.files.delete(notePath);
  assert.equal((await f.run()).updated, 1);
  assert.ok(f.files.has(notePath));
});

test('network failure leaves all existing files intact', async () => {
  const f = fixture();
  await f.run();
  const before = [...f.files];
  f.client.subjects = async () => { throw new Error('Tailscale unavailable'); };
  await assert.rejects(f.run, /Tailscale unavailable/);
  assert.deepEqual([...f.files], before);
});

test('a failed subject does not block another subject', async () => {
  const f = fixture();
  f.subjects.unshift({ id: 2, title: 'Unavailable subject' });
  const read = f.client.notes;
  f.client.notes = async id => {
    if (id === 2) throw new Error('HTTP 404');
    return read(id);
  };
  const result = await f.run();
  assert.equal(result.errors.length, 1);
  assert.equal(result.updated, 1);
});

test('downloads only same-origin Scio images, supports absolute URLs and deduplicates', async () => {
  const f = fixture();
  f.notes[0].content = `![one](${server}${imageUrl})\n![two](${imageUrl})\n![other](https://example.com${imageUrl})`;
  await f.run();
  assert.equal(f.calls.image, 1);
  assert.ok(f.files.get(notePath)!.includes(`https://example.com${imageUrl}`));
  assert.ok(!f.files.get(notePath)!.includes(`${server}${imageUrl}`));
});

test('preserves images already downloaded if a subsequent image fails', async () => {
  const f = fixture();
  const second = imageUrl.replace(imageName, `${'b'.repeat(32)}.png`);
  f.notes[0].content = `![one](${imageUrl})\n![two](${second})`;
  f.hooks.image = () => { if (f.calls.image === 2) throw new Error('Offline'); };
  assert.equal((await f.run()).errors.length, 1);
  assert.equal(f.images.size, 1);
  assert.equal(f.files.size, 0);
  f.hooks.image = undefined;
  assert.equal((await f.run()).updated, 1);
  assert.equal(f.calls.image, 3);
});

test('handles duplicate titles and sanitizes filesystem characters', async () => {
  const f = fixture();
  f.subjects[0].title = '../Biology: [intro]';
  f.notes[0].title = 'A/B:*?';
  f.notes.push({ ...f.notes[0], id: 13 });
  assert.equal((await f.run()).updated, 2);
  assert.equal(f.files.size, 2);
  for (const path of f.files.keys()) {
    assert.equal(path.split('/').length, 3);
    assert.ok(!path.includes('..'));
    assert.ok(!/[\[\]:*?]/.test(path));
  }
});

test('rejects mismatched server identities before writing', async () => {
  const f = fixture();
  f.client.note = async () => ({ ...f.notes[0], id: 999 });
  assert.equal((await f.run()).errors.length, 1);
  assert.equal(f.files.size, 0);
});

test('cancelled sync does not write a note after its in-flight download', async () => {
  const f = fixture();
  let cancelled = false;
  f.hooks.note = () => { cancelled = true; };
  await syncNotes({ server, folder: 'Scio', client: f.client, vault: f.vault, state: f.state,
    save: async () => {}, cancelled: () => cancelled });
  assert.equal(f.files.size, 0);
});

test('validates root addresses and blocks vault path traversal or hidden folders', () => {
  assert.equal(serverUrl(' http://100.64.0.1:8001/ '), server);
  assert.equal(targetFolder('Learning/Scio'), 'Learning/Scio');
  for (const value of ['file:///tmp', 'https://user:pass@host', `${server}/api`, `${server}?x=1`, `${server}#fragment`]) {
    assert.throws(() => serverUrl(value));
  }
  for (const value of ['', '../Scio', '/Scio', 'Scio/../notes', '.obsidian', 'Scio/.hidden', 'Scio\\notes', 'Scio//notes', 'Scio/']) {
    assert.throws(() => targetFolder(value));
  }
});

import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/scio-notes', { recursive: true });
const testing = process.argv[2] === 'test';
await build({
  entryPoints: [testing ? 'tests/sync.test.ts' : 'src/main.ts'],
  outfile: testing ? 'dist/tests.cjs' : 'main.js',
  bundle: true,
  format: 'cjs',
  platform: testing ? 'node' : 'browser',
  target: testing ? 'node20' : 'es2020',
  external: ['obsidian'],
  logLevel: 'info',
});
if (!testing) {
  await copyFile('main.js', 'dist/scio-notes/main.js');
  await copyFile('manifest.json', 'dist/scio-notes/manifest.json');
  await copyFile('README.md', 'dist/scio-notes/README.md');
  await copyFile('LICENSE', 'dist/scio-notes/LICENSE');
}

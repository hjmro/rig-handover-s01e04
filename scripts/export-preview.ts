import { serve } from '@hono/node-server';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const [destination, mode] = process.argv.slice(2);
if (!destination || (mode !== undefined && mode !== '--without-marker')) {
  throw new Error('Usage: pnpm preview /outside-the-repo/index.html [--without-marker]');
}
const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(destination);
function inRepo(path: string): boolean {
  const fromRepo = relative(repo, path);
  return fromRepo === '' || (!isAbsolute(fromRepo) && fromRepo !== '..' && !fromRepo.startsWith(`..${sep}`));
}
if (inRepo(output)) throw new Error('Save previews outside the repository (ADR 0003).');
mkdirSync(dirname(output), { recursive: true });
if (inRepo(realpathSync(dirname(output)))) throw new Error('Preview directory points into the repository.');
if (mode === '--without-marker') process.env.LANE_MARKER = '';

// Serve the same app as rig on a temporary localhost port, then fetch the HTML.
const server = serve({ fetch: createApp().fetch, hostname: '127.0.0.1', port: 0 });
try {
  await new Promise<void>((resolve, reject) => {
    if (server.listening) resolve();
    else server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No localhost address available.');
  const response = await fetch(`http://127.0.0.1:${address.port}/digest/2026-10-28`);
  if (!response.ok) throw new Error(`Digest returned HTTP ${response.status}.`);
  const html = await response.text();
  writeFileSync(output, html, { mode: 0o600 });
  console.log(`Saved digest preview to ${output}`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

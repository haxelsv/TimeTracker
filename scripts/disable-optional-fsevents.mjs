// fsevents is optional. Use Node's portable watcher, avoiding a native addon
// that can be quarantined when this project lives in a synced macOS folder.
// This does not modify Gatekeeper, quarantine attributes, or system settings.
import { readFile, rm } from 'node:fs/promises';
const directory = new URL('../node_modules/fsevents/', import.meta.url);
try {
  const manifest = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'));
  if (manifest.name !== 'fsevents') throw new Error('Unexpected dependency at fsevents path');
  await rm(directory, { recursive: true, force: true });
  console.log('Star5Tracker: optional fsevents removed; using portable file watching.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

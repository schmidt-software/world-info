// Fetches every snapshot source and writes site/data/<id>.json plus
// site/data/manifest.json, which the page reads to build its snapshot layers.
//
// Snapshot sources are the ones the browser cannot query itself: they need an
// API key (kept in GitHub Secrets, never shipped to the page) or lack CORS
// headers. The Pages workflow runs this before every deployment.
//
// Locally, with keys in a git-ignored .env file:
//   node --env-file-if-exists=.env scripts/fetch-data.mjs [source-id ...]

import { mkdir, writeFile } from 'node:fs/promises';
import { sources } from './sources/index.mjs';

const OUTPUT_DIR = new URL('../site/data/', import.meta.url);
const inGitHubActions = Boolean(process.env.GITHUB_ACTIONS);

const selectedIds = process.argv.slice(2);
const selected = selectedIds.length
  ? sources.filter((source) => selectedIds.includes(source.id))
  : sources;

await mkdir(OUTPUT_DIR, { recursive: true });

const layers = await Promise.all(selected.map(runSource));
const manifest = { generatedAt: new Date().toISOString(), layers };
await writeFile(new URL('manifest.json', OUTPUT_DIR), `${JSON.stringify(manifest, null, 1)}\n`);

for (const layer of layers) {
  const summary = layer.status === 'ok' ? `${layer.count} events` : layer.message;
  console.log(`${layer.id.padEnd(22)} ${layer.status.padEnd(15)} ${summary}`);
}

async function runSource(source) {
  const layer = {
    id: source.id,
    label: source.label,
    color: source.color,
    pulse: source.pulse ?? true,
    attribution: source.attribution,
    requiredEnv: source.requiredEnv ?? [],
  };

  const missing = layer.requiredEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    return { ...layer, status: 'not-configured', message: `Missing ${missing.join(', ')}` };
  }

  const startedAt = Date.now();
  try {
    const events = await source.fetch(process.env);
    const data = {
      generatedAt: new Date().toISOString(),
      events: events.map((event) => ({ ...event, time: event.time.toISOString() })),
    };
    await writeFile(new URL(`${source.id}.json`, OUTPUT_DIR), JSON.stringify(data));
    return { ...layer, status: 'ok', count: events.length, durationMs: Date.now() - startedAt };
  } catch (error) {
    // One failing provider must not block the deployment of all others.
    if (inGitHubActions) console.log(`::warning title=${source.id}::${error.message}`);
    return { ...layer, status: 'error', message: error.message };
  }
}

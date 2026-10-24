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
const MAX_STALE_MINUTES = 120;
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
  const summary = layer.status === 'ok'
    ? `${layer.count} events${layer.reused ? ' (previous data reused)' : ''}${layer.message ? `: ${layer.message}` : ''}`
    : layer.message;
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

  // Sources with tight daily quotas set minIntervalMinutes; until then the
  // data already published on the site is deployed again unchanged.
  const published = await loadPublished(source.id);
  const publishedAgeMinutes = published ? (Date.now() - Date.parse(published.generatedAt)) / 60000 : Infinity;
  if (publishedAgeMinutes < (source.minIntervalMinutes ?? 0)) {
    await writeData(source.id, published);
    return { ...layer, status: 'ok', count: published.events.length, reused: true };
  }

  const startedAt = Date.now();
  try {
    const events = await source.fetch(process.env);
    await writeData(source.id, {
      generatedAt: new Date().toISOString(),
      events: events.map((event) => ({ ...event, time: event.time.toISOString() })),
    });
    return { ...layer, status: 'ok', count: events.length, durationMs: Date.now() - startedAt };
  } catch (error) {
    // One failing provider must not block the deployment of all others.
    if (inGitHubActions) console.log(`::warning title=${source.id}::${error.message}`);
    // Short outages keep the last good data; the page shows its age.
    if (publishedAgeMinutes < MAX_STALE_MINUTES) {
      await writeData(source.id, published);
      return { ...layer, status: 'ok', count: published.events.length, reused: true, message: error.message };
    }
    return { ...layer, status: 'error', message: error.message };
  }
}

async function writeData(id, data) {
  await writeFile(new URL(`${id}.json`, OUTPUT_DIR), JSON.stringify(data));
}

// PUBLISHED_DATA_URL points to site/data/ of the live site; the workflow sets
// it. Locally it is usually unset, and every source is fetched fresh.
async function loadPublished(id) {
  if (!process.env.PUBLISHED_DATA_URL) return null;
  try {
    const response = await fetch(new URL(`${id}.json`, process.env.PUBLISHED_DATA_URL), {
      signal: AbortSignal.timeout(15000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

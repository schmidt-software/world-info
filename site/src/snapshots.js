// Layers whose data is fetched by scripts/fetch-data.mjs during deployment
// (sources that need an API key or lack CORS headers). The manifest lists
// every snapshot layer with its status; this turns each entry into a source
// with the same interface as the ones in sources.js.

const MINUTE = 60 * 1000;

export async function loadSnapshotSources() {
  const response = await fetch('data/manifest.json', { cache: 'no-cache' });
  // No manifest means the fetch script has not run (e.g. a plain local
  // checkout); the page then simply shows the browser layers.
  if (!response.ok) return [];
  const manifest = await response.json();

  return manifest.layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    color: layer.color,
    pulse: layer.pulse,
    cluster: layer.cluster,
    clusterNoun: layer.clusterNoun,
    attribution: layer.attribution,
    // The files change only on redeployment, which can be hours apart.
    refreshMs: 5 * MINUTE,
    unavailable: layer.status === 'ok' ? null : describeStatus(layer),
    async fetch() {
      const dataResponse = await fetch(`data/${layer.id}.json`, { cache: 'no-cache' });
      if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
      const data = await dataResponse.json();
      return {
        updatedAt: new Date(data.generatedAt),
        events: data.events.map((event) => ({ ...event, time: new Date(event.time) })),
      };
    },
  }));
}

function describeStatus(layer) {
  if (layer.status === 'not-configured') return `Not configured (${layer.message.replace('Missing', 'missing')})`;
  return `Unavailable: ${layer.message}`;
}

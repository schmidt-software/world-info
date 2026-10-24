// Builds the layer list of site/data/manifest.json.

// A run may fetch only some sources (for example while debugging one of them).
// Their fresh entries replace the previous ones; every other source keeps its
// previous entry, so its layer stays visible. The order follows `sourceIds`,
// and entries of sources that no longer exist are dropped.
export function mergeLayers(sourceIds, freshLayers, previousLayers = []) {
  const fresh = new Map(freshLayers.map((layer) => [layer.id, layer]));
  const previous = new Map(previousLayers.map((layer) => [layer.id, layer]));
  return sourceIds.flatMap((id) => {
    const layer = fresh.get(id) ?? previous.get(id);
    return layer ? [layer] : [];
  });
}

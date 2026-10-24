// Builds scripts/data/region-centroids.json, a lookup from region codes to
// a representative point. MeteoAlarm feeds identify most warning areas only
// by such codes, without coordinates.
//
// - EMMA_ID: MeteoAlarm region codes, centroids from the MeteoAlarm_Geocodes
//   layer published by GeoSphere Austria.
// - NUTS: Eurostat NUTS 2021 and 2024 label points (GISCO), used by some
//   countries instead of EMMA_ID. 2024 wins where both define a code.
//
// The codes change rarely; rerun this script when the fetch log reports
// unmapped areas.
//
//   node scripts/build-region-centroids.mjs

import { writeFile } from 'node:fs/promises';

const EMMA_LAYER = 'https://gis.geosphere.at/maps/rest/services/Hosted/MeteoAlarm_Gap_Analysis_2026_WFL1/FeatureServer/3/query';
const NUTS_LABEL_POINTS = [2021, 2024].map(
  (year) => `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_LB_${year}_4326.geojson`,
);
const PAGE_SIZE = 1000;
const OUTPUT = new URL('./data/region-centroids.json', import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function point(name, lat, lon) {
  return { name, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
}

async function emmaCentroids() {
  const centroids = {};
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: 'code,name',
      returnGeometry: 'false',
      returnCentroid: 'true',
      outSR: '4326',
      orderByFields: 'objectid',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'json',
    });
    const page = await fetchJson(`${EMMA_LAYER}?${params}`);
    if (page.error) throw new Error(page.error.message);
    for (const { attributes, centroid } of page.features) {
      centroids[attributes.code] = point(attributes.name, centroid.y, centroid.x);
    }
    if (page.features.length < PAGE_SIZE) return centroids;
  }
}

async function nutsCentroids() {
  const centroids = {};
  for (const url of NUTS_LABEL_POINTS) {
    const { features } = await fetchJson(url);
    for (const { properties, geometry } of features) {
      // "Extra-Regio" codes (ending in Z) have no territory and no point.
      if (!geometry) continue;
      const [lon, lat] = geometry.coordinates;
      centroids[properties.NUTS_ID] = point(properties.NAME_LATN, lat, lon);
    }
  }
  return centroids;
}

function sortedByKey(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

const lookup = {
  EMMA_ID: sortedByKey(await emmaCentroids()),
  NUTS: sortedByKey(await nutsCentroids()),
};
await writeFile(OUTPUT, `${JSON.stringify(lookup, null, 1)}\n`);
console.log(`Wrote ${Object.keys(lookup.EMMA_ID).length} EMMA_ID and ${Object.keys(lookup.NUTS).length} NUTS codes`);

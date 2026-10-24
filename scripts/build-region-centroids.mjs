// Builds scripts/data/region-centroids.json, a lookup from region codes to
// a representative point. MeteoAlarm feeds identify most warning areas only
// by such codes, without coordinates.
//
// - EMMA_ID: MeteoAlarm region codes, centroids from the MeteoAlarm_Geocodes
//   layer published by GeoSphere Austria.
// - NUTS: Eurostat NUTS label points (GISCO) of all versions from 2010 to
//   2024, used by some countries instead of EMMA_ID. France still sends NUTS
//   2013 codes. A newer version wins where several define a code.
// - FIPS: Irish counties from the Natural Earth admin-1 data, used by the
//   Irish feed. Codes that Natural Earth assigns to more than one unit are
//   left out rather than guessed.
//
// The codes change rarely; rerun this script when the fetch log reports
// unmapped areas.
//
//   node scripts/build-region-centroids.mjs

import { writeFile } from 'node:fs/promises';

const EMMA_LAYER = 'https://gis.geosphere.at/maps/rest/services/Hosted/MeteoAlarm_Gap_Analysis_2026_WFL1/FeatureServer/3/query';
const NUTS_LABEL_POINTS = [2010, 2013, 2016, 2021, 2024].map(
  (year) => `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_LB_${year}_4326.geojson`,
);
const NATURAL_EARTH_ADMIN1 = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';
const FIPS_COUNTRIES = new Set(['IE']);
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

async function fipsCentroids() {
  const { features } = await fetchJson(NATURAL_EARTH_ADMIN1);
  const centroids = {};
  const ambiguous = new Set();
  for (const { properties: p } of features) {
    if (!FIPS_COUNTRIES.has(p.iso_a2) || !p.fips) continue;
    if (centroids[p.fips]) ambiguous.add(p.fips);
    centroids[p.fips] = point(p.name, p.latitude, p.longitude);
  }
  for (const code of ambiguous) delete centroids[code];
  if (ambiguous.size) console.warn(`Skipped ambiguous FIPS codes: ${[...ambiguous].join(', ')}`);
  return centroids;
}

function sortedByKey(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

const lookup = {
  EMMA_ID: sortedByKey(await emmaCentroids()),
  NUTS: sortedByKey(await nutsCentroids()),
  FIPS: sortedByKey(await fipsCentroids()),
};
await writeFile(OUTPUT, `${JSON.stringify(lookup, null, 1)}\n`);
console.log(`Wrote ${Object.keys(lookup.EMMA_ID).length} EMMA_ID, ${Object.keys(lookup.NUTS).length} NUTS and ${Object.keys(lookup.FIPS).length} FIPS codes`);

# World Info

A 3D globe that shows events happening on Earth right now, each at its location.
Built with [Three.js](https://threejs.org/) as a static site for GitHub Pages: no
build step and no backend.

Live: <https://schmidt-software.github.io/world-info/>

## Features

- Map-style globe with land, water, coastlines, country borders and country
  names, and a live day/night terminator
- Earthquakes (Europe live via EMSC, rest of the world via USGS), weather
  warnings for Germany and the rest of Europe, ships in the Baltic Sea, natural
  events, disaster alerts and the live ISS position
- Events from the last hour pulse
- Markers keep their size on screen at every zoom level; dense layers (ships,
  aircraft) are grouped into clusters while zoomed out, and clicking a cluster
  zooms in
- Zoom from the whole globe down to about 1 km above the ground with the mouse
  wheel, trackpad or touch pinch, the + and - keys or the zoom buttons; the
  point under the pointer stays in place
- Hover a marker for details, click it to open the source page
- "List all events" in the panel opens a searchable list of every loaded event,
  filterable by layer, with a link to each event's source page and a "Map"
  button that flies the globe to the event; clicking a layer in the panel opens
  the list filtered to that layer
- Layers can be toggled; every layer refreshes on its own interval

## How data gets to the page

There are two kinds of layers:

- **Browser layers** (`site/src/sources.js`) are queried directly by the page.
  This only works for sources that are free, need no key and send CORS headers
  that allow any origin.
- **Snapshot layers** (`scripts/sources/`) are fetched by
  `scripts/fetch-data.mjs` during deployment and written to `site/data/` as
  JSON. This covers sources that need an API key, which must never be shipped
  to a public page, and sources without CORS headers. The page discovers them
  through `site/data/manifest.json`. A snapshot source whose key is missing is
  listed in the panel as not configured.

## Run locally

ES modules need to be served over HTTP, opening `index.html` from disk does not work.
Fetch the snapshot layers first (optional; without them only the browser layers show):

```bash
node --env-file-if-exists=.env scripts/fetch-data.mjs
python3 -m http.server 8000 --directory site
```

Then open <http://localhost:8000>. API keys for snapshot sources go into a
git-ignored `.env` file in the repository root; `.env.example` lists them.

Parser tests for the snapshot sources:

```bash
node --test 'scripts/test/*.test.mjs'
```

## API keys

Every key is optional. Register with the provider, then store the key as a
repository secret under the name from `.env.example`, for example:

```bash
gh secret set TOMTOM_API_KEY
```

The next scheduled deployment picks it up. Keys never reach the published
site: only the fetched data is deployed.

## Deployment

`.github/workflows/pages.yml` fetches the snapshot data and publishes the `site/`
folder on every push to `main` and on a schedule of every 10 minutes. API keys
are read from repository secrets.

GitHub does not keep that schedule: scheduled runs are delayed or dropped when
GitHub Actions is under load. For this repository they ran only every 2.5 to
4.5 hours (checked on 2026-10-24). Snapshot layers can therefore be several
hours old; the panel shows the real age of every layer. To refresh them right
away, run `gh workflow run pages.yml`. If a source fails, its last published
data is kept for up to 6 hours, which bridges a failed run. GitHub Pages must be set to "GitHub Actions" once
in the repository settings (Settings > Pages > Build and deployment > Source).

GitHub disables scheduled workflows after 60 days without repository activity;
they can be re-enabled on the Actions tab.

## Project layout

```
site/
  index.html     page shell and import map (Three.js and topojson from jsDelivr)
  styles.css
  src/
    main.js      wires layers, UI panel, tooltip and refresh timers
    eventlist.js searchable list of all loaded events
    format.js    date formatting shared by tooltip and list
    zoom.js      wheel, pinch, button and key zoom with a fixed anchor
    altitude.js  altitude limits, zoom steps and slippy map zoom level
    globe.js     scene, camera, controls, globe shader, borders
    markers.js   one instanced marker layer per data source, sized in pixels
    screen.js    occlusion, clustering and picking in screen space
    sources.js   browser layers, all normalized to one event shape
    snapshots.js snapshot layers listed in data/manifest.json
    geo.js       coordinate conversion and subsolar point
    mapstyle.js  draws land and water into the globe texture
    mapgeometry.js antimeridian, polar rings and label anchors
    labels.js    country name labels with fading and decluttering
scripts/
  fetch-data.mjs             runs all snapshot sources, writes site/data/
  sources/                   one module per snapshot source
  test/                      parser tests (node --test)
  build-region-centroids.mjs builds data/region-centroids.json
  data/region-centroids.json region code to point lookup for MeteoAlarm
```

## Data sources

All sources were checked on 2026-10-24.

### Browser layers

| Layer | Source | Endpoint | Refresh | License / terms |
|---|---|---|---|---|
| Earthquakes Europe | [EMSC Seismic Portal](https://www.seismicportal.eu/webservices.html) | FDSN `event/1/query` plus WebSocket `standing_order/websocket` | live, REST every 15 min | CC BY 4.0 |
| Earthquakes outside Europe | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | `summary/2.5_day.geojson` | 5 min | Public domain |
| Weather warnings Germany | [DWD GeoServer](https://maps.dwd.de/) | WFS `dwd:Warnungen_Landkreise`, active warnings only | 10 min | CC BY 4.0, see [dwd.de/copyright](https://www.dwd.de/copyright) |
| Ships Baltic Sea | [Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) (Fintraffic) | `ais/v1/locations`, `ais/v1/vessels` | 2 min | CC BY 4.0 |
| Natural events | [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | `events?status=open&days=30` | 15 min | Public domain |
| Disaster alerts | [GDACS](https://www.gdacs.org/) | `gdacsapi/api/events/geteventlist/SEARCH` | 15 min | Attribution required, see the GDACS terms of use |
| ISS position | [wheretheiss.at](https://wheretheiss.at/w/developer) | `v1/satellites/25544` | 5 s | Free, about 1 request per second |
| Land, borders, country names | [Natural Earth](https://www.naturalearthdata.com/) 1:50m via [world-atlas](https://github.com/topojson/world-atlas) | `countries-50m.json` | once | Public domain |

### Snapshot layers

| Layer | Source | Endpoint | Key | License / terms |
|---|---|---|---|---|
| Weather warnings Europe | [MeteoAlarm](https://feeds.meteoalarm.org/) (EUMETNET) | `api/v1/warnings/feeds-<country>` | none, but no CORS | CC BY 4.0 |
| Active fires Europe | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) | `api/area/csv` VIIRS S-NPP and NOAA-20, 24 h | `NASA_FIRMS_MAP_KEY` | NASA open data, attribution requested |
| Aircraft over Europe | [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) | `api/states/all` with OAuth2 client credentials | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Non-commercial use, see OpenSky terms |
| Ships around Europe | [aisstream.io](https://aisstream.io/documentation) | WebSocket `v0/stream`, listened to for 45 s per run | `AISSTREAM_API_KEY` | Free; browser connections not allowed |
| Traffic incidents | [TomTom Traffic API](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-incidents/incident-details) | `traffic/services/5/incidentDetails`, 20 city boxes, every 20 min | `TOMTOM_API_KEY` | Free tier, 2,500 requests per day |
| Concerts and events | [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) | `discovery/v2/events`, 17 countries, every 20 min | `TICKETMASTER_API_KEY` | 5,000 requests per day |
| Poor air quality | [OpenAQ v3](https://docs.openaq.org/) | `v3/parameters/2/latest` (PM2.5), every 30 min | `OPENAQ_API_KEY` | Data licenses vary by provider |
| Electricity load | [ENTSO-E Transparency Platform](https://transparency.entsoe.eu/) | `api?documentType=A65` per bidding zone, every 30 min | `ENTSOE_SECURITY_TOKEN` | Free reuse with attribution |
| Live webcams | [Windy Webcams API v3](https://api.windy.com/webcams/docs) | `webcams/api/v3/webcams`, every 60 min | `WINDY_WEBCAMS_API_KEY` | Free tier |

Notes on the key-based layers:

- They were verified up to authentication (each rejects an invalid key with a
  clear error) and their parsers are tested against documented payloads; the
  first run with real keys is still outstanding.
- Request intervals keep every source within its free quota; until an interval
  has passed, the previously published data is deployed again.
- OpenSky aircraft are shown only in flight. OpenSky may restrict requests from
  cloud networks; if the layer stays unavailable on GitHub, this is the likely
  cause.
- The Windy bbox parameter order (north, east, south, west) is taken from the
  Windy map cluster API and still needs to be confirmed with a real key.
- OpenAQ shows only stations at or above the EU air quality index level
  "poor" (25 µg/m³ PM2.5), so the layer marks notable pollution.

MeteoAlarm identifies warning areas by region code. The lookup in
`scripts/data/region-centroids.json` maps them to points, built from the
MeteoAlarm_Geocodes layer of [GeoSphere Austria](https://gis.geosphere.at/)
(EMMA_ID codes), the NUTS label points of all versions from 2010 to 2024 of
[Eurostat GISCO](https://ec.europa.eu/eurostat/web/gisco) (© EuroGeographics
for the administrative boundaries; France still uses NUTS 2013 codes) and the
Irish county FIPS codes of [Natural Earth](https://www.naturalearthdata.com/)
admin-1 data. An area with several codes is placed at their average. Germany
is skipped because the DWD layer covers it in more detail.

### Evaluated but not usable in the browser

| Source | Content | Reason |
|---|---|---|
| OpenSky Network | Live aircraft | CORS limited to opensky-network.org |
| adsb.lol | Live aircraft | No CORS headers |
| NOAA National Hurricane Center | Active storms | No CORS headers |
| GDELT GEO 2.0 | Geolocated news | Endpoint returns 404 |
| Open Notify | ISS position | HTTP only, blocked as mixed content on HTTPS pages |

### Candidates for later layers

These passed the CORS check but are not events in themselves; they could add
context to the globe: [Open-Meteo](https://open-meteo.com/) (weather at any
point) and [sunrise-sunset.org](https://sunrise-sunset.org/api).

# World Info

A 3D globe that shows events happening on Earth right now, each at its location.
Built with [Three.js](https://threejs.org/) as a static site for GitHub Pages: no
build step, no backend, no API keys.

## Features

- Globe with coastlines and country borders and a live day/night terminator
- Earthquakes (Europe live via EMSC, rest of the world via USGS), weather
  warnings for Germany, ships in the Baltic Sea, natural events, disaster
  alerts and the live ISS position
- Events from the last hour pulse
- Hover a marker for details, click it to open the source page
- Layers can be toggled; every layer refreshes on its own interval

## Run locally

ES modules need to be served over HTTP, opening `index.html` from disk does not work:

```bash
python3 -m http.server 8000 --directory site
```

Then open <http://localhost:8000>.

## Deployment

`.github/workflows/pages.yml` publishes the `site/` folder on every push to `main`.
GitHub Pages must be set to "GitHub Actions" once in the repository settings
(Settings > Pages > Build and deployment > Source).

## Project layout

```
site/
  index.html     page shell and import map (Three.js and topojson from jsDelivr)
  styles.css
  src/
    main.js      wires layers, UI panel, tooltip and refresh timers
    globe.js     scene, camera, controls, globe shader, borders
    markers.js   one marker layer per data source
    sources.js   API clients, all normalized to one event shape
    geo.js       coordinate conversion and subsolar point
```

## Data sources

Because the site runs entirely in the browser, a source is only usable if it is
free, needs no key, and sends CORS headers that allow any origin. All sources
were checked against these criteria on 2026-10-24.

| Layer | Source | Endpoint | Refresh | License / terms |
|---|---|---|---|---|
| Earthquakes Europe | [EMSC Seismic Portal](https://www.seismicportal.eu/webservices.html) | FDSN `event/1/query` plus WebSocket `standing_order/websocket` | live, REST every 15 min | CC BY 4.0 |
| Earthquakes outside Europe | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | `summary/2.5_day.geojson` | 5 min | Public domain |
| Weather warnings Germany | [DWD GeoServer](https://maps.dwd.de/) | WFS `dwd:Warnungen_Gemeinden_vereinigt` | 10 min | CC BY 4.0, see [dwd.de/copyright](https://www.dwd.de/copyright) |
| Ships Baltic Sea | [Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) (Fintraffic) | `ais/v1/locations`, `ais/v1/vessels` | 2 min | CC BY 4.0 |
| Natural events | [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | `events?status=open&days=30` | 15 min | Public domain |
| Disaster alerts | [GDACS](https://www.gdacs.org/) | `gdacsapi/api/events/geteventlist/SEARCH` | 15 min | Attribution required, see the GDACS terms of use |
| ISS position | [wheretheiss.at](https://wheretheiss.at/w/developer) | `v1/satellites/25544` | 5 s | Free, about 1 request per second |
| Borders | [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | `countries-110m.json` | once | Public domain |

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

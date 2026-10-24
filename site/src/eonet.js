// Link selection for NASA EONET events. Kept free of browser and Three.js
// dependencies so that it can be tested with node --test.

// EONET sources whose URL is a readable web page about the event. Most other
// sources point to data products: IRWIN wildfire records need a login, JTWC
// storm bulletins and National Ice Center tables download as files.
const PAGE_SOURCES = new Set(['EO']);

// Opens the event in NASA Worldview, which lists it and zooms to it. The date
// is required: without it Worldview drops long-running events such as
// icebergs from its list.
export function worldviewUrl(eventId, date) {
  return `https://worldview.earthdata.nasa.gov/?e=${eventId},${date.toISOString().slice(0, 10)}`;
}

export function eventUrl(event, latestDate) {
  const page = event.sources?.find((source) => PAGE_SOURCES.has(source.id));
  return page?.url ?? worldviewUrl(event.id, latestDate);
}

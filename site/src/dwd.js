// Helpers for the DWD warning layer. Kept free of browser and Three.js
// dependencies so that they can be tested with node --test.

const REPORT_BASE = 'https://www.dwd.de/DE/wetter/warnungen_aktuell/warnlagebericht/';

// The DWD publishes one warning situation report per region; some regions
// combine several states. Keys are the GC_STATE codes of the warning data.
const REPORTS = {
  BW: 'baden-wuerttemberg/warnlage_baw',
  BE: 'berlin_brandenburg/warnlage_bb',
  BB: 'berlin_brandenburg/warnlage_bb',
  HE: 'hessen/warnlage_hes',
  MV: 'mecklenburg_vorpommern/warnlage_mv',
  NI: 'niedersachsen_bremen/warnlage_nds',
  HB: 'niedersachsen_bremen/warnlage_nds',
  NW: 'nordrhein_westfalen/warnlage_nrw',
  RP: 'rheinland-pfalz_saarland/warnlage_rps',
  SL: 'rheinland-pfalz_saarland/warnlage_rps',
  ST: 'sachen_anhalt/warnlage_saa',
  SN: 'sachsen/warnlage_sac',
  SH: 'schleswig_holstein_hamburg/warnlage_shh',
  HH: 'schleswig_holstein_hamburg/warnlage_shh',
  TH: 'thueringen/warnlage_thu',
};

// Bavaria has a northern and a southern report. Warn cell ids embed the
// official district key (09 = Bavaria) whose next digit is the government
// region: 3 to 6 (Upper Palatinate and the three Franconias) are northern.
const NORTH_BAVARIAN_REGIONS = new Set(['3', '4', '5', '6']);

const SEVERITIES = {
  Minor: { rank: 1, size: 0.6 },
  Moderate: { rank: 2, size: 0.9 },
  Severe: { rank: 3, size: 1.4 },
  Extreme: { rank: 4, size: 2 },
};

export function warningReportUrl(state, warnCellId) {
  let path = REPORTS[state];
  if (state === 'BY') {
    path = NORTH_BAVARIAN_REGIONS.has(String(warnCellId)[3])
      ? 'nordbayern/warnlage_nordbay'
      : 'suedbayern/warnlage_suedbay';
  }
  return `${REPORT_BASE}${path ?? 'warnlagebericht'}_node.html`;
}

// Turns the features of dwd:Warnungen_Landkreise into one event per district.
// A district often has several warnings at once (gusts and rain, say); they
// are merged into one marker sized by the most severe one.
export function districtEvents(features) {
  const districts = new Map();
  for (const { bbox, properties: p } of features) {
    const district = districts.get(p.GC_WARNCELLID) ?? {
      bbox, name: p.AREADESC, state: p.GC_STATE, warnCellId: p.GC_WARNCELLID, warnings: [],
    };
    district.warnings.push({
      event: capitalizeWords(p.EVENT),
      severity: p.SEVERITY,
      onset: Date.parse(p.ONSET),
      expires: Date.parse(p.EXPIRES),
    });
    districts.set(p.GC_WARNCELLID, district);
  }

  return [...districts.values()].map((district) => {
    const warnings = district.warnings.sort((a, b) => rank(b.severity) - rank(a.severity));
    const [minLon, minLat, maxLon, maxLat] = district.bbox;
    const events = [...new Set(warnings.map((warning) => warning.event))];
    const until = new Date(Math.max(...warnings.map((warning) => warning.expires)));
    return {
      id: String(district.warnCellId),
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2,
      title: district.name,
      detail: `${events.join(', ')}; ${warnings[0].severity}, until ${until.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}`,
      time: new Date(Math.min(...warnings.map((warning) => warning.onset))),
      url: warningReportUrl(district.state, district.warnCellId),
      size: SEVERITIES[warnings[0].severity]?.size ?? 0.8,
    };
  });
}

function rank(severity) {
  return SEVERITIES[severity]?.rank ?? 0;
}

// DWD event names are upper case ("SCHWERE STURMBÖEN"). Capitalizing every
// word ("Schwere Sturmböen") keeps German nouns correct in most cases.
function capitalizeWords(text) {
  return text.toLowerCase().replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

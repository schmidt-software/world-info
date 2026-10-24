// Current electricity consumption (actual total load) per country from the
// ENTSO-E Transparency Platform. One marker per country, sized by load.
// Values are published with a delay of about one hour; the latest reported
// quarter hour or hour is shown.

import { fetchText } from '../lib.mjs';

// Bidding zone EIC codes and a point near the centre of each country.
const COUNTRIES = [
  ['Austria', '10YAT-APG------L', 47.6, 14.1], ['Belgium', '10YBE----------2', 50.6, 4.6],
  ['Bulgaria', '10YCA-BULGARIA-R', 42.7, 25.3], ['Croatia', '10YHR-HEP------M', 45.4, 16.0],
  ['Czechia', '10YCZ-CEPS-----N', 49.8, 15.5], ['Denmark', '10Y1001A1001A65H', 56.0, 9.5],
  ['Estonia', '10Y1001A1001A39I', 58.7, 25.5], ['Finland', '10YFI-1--------U', 62.5, 25.8],
  ['France', '10YFR-RTE------C', 46.6, 2.4], ['Germany', '10Y1001A1001A82H', 51.1, 10.4],
  ['Greece', '10YGR-HTSO-----Y', 39.3, 22.0], ['Hungary', '10YHU-MAVIR----U', 47.2, 19.4],
  ['Ireland', '10Y1001A1001A59C', 53.2, -7.7], ['Italy', '10YIT-GRTN-----B', 42.8, 12.6],
  ['Latvia', '10YLV-1001A00074', 56.9, 24.6], ['Lithuania', '10YLT-1001A0008Q', 55.3, 23.9],
  ['Netherlands', '10YNL----------L', 52.2, 5.5], ['Norway', '10YNO-0--------C', 61.0, 9.0],
  ['Poland', '10YPL-AREA-----S', 52.1, 19.4], ['Portugal', '10YPT-REN------W', 39.6, -8.0],
  ['Romania', '10YRO-TEL------P', 45.9, 25.0], ['Serbia', '10YCS-SERBIATSOV', 44.0, 20.9],
  ['Slovakia', '10YSK-SEPS-----K', 48.7, 19.7], ['Slovenia', '10YSI-ELES-----O', 46.1, 14.8],
  ['Spain', '10YES-REE------0', 40.2, -3.6], ['Sweden', '10YSE-1--------K', 62.0, 15.0],
  ['Switzerland', '10YCH-SWISSGRIDZ', 46.8, 8.2],
];
const LOOKBACK_MS = 6 * 60 * 60 * 1000;
const RESOLUTION_MINUTES = { PT15M: 15, PT30M: 30, PT60M: 60 };

export default {
  id: 'entsoe-load',
  label: 'Electricity load per country (ENTSO-E)',
  color: 0x2dd4bf,
  pulse: false,
  attribution: 'ENTSO-E Transparency Platform',
  requiredEnv: ['ENTSOE_SECURITY_TOKEN'],
  minIntervalMinutes: 30,
  async fetch(env) {
    const now = Date.now();
    const events = [];
    const failed = [];
    for (const [country, code, lat, lon] of COUNTRIES) {
      const params = new URLSearchParams({
        securityToken: env.ENTSOE_SECURITY_TOKEN,
        documentType: 'A65',
        processType: 'A16',
        outBiddingZone_Domain: code,
        periodStart: entsoeTime(now - LOOKBACK_MS),
        periodEnd: entsoeTime(now),
      });
      try {
        const latest = latestPoint(await fetchText(`https://web-api.tp.entsoe.eu/api?${params}`));
        if (!latest) continue;
        events.push({
          id: code,
          lat,
          lon,
          title: `${country}: ${(latest.megawatts / 1000).toFixed(1)} GW`,
          detail: 'Actual total electricity load',
          time: latest.time,
          url: 'https://transparency.entsoe.eu/load-domain/r2/totalLoadR2/show',
          size: 0.5 + Math.sqrt(latest.megawatts) / 160,
        });
      } catch (error) {
        // Some zones have gaps; one missing country should not drop the rest.
        failed.push(`${country} (${error.message.slice(0, 80)})`);
      }
    }
    if (!events.length && failed.length) throw new Error(`ENTSO-E: ${failed[0]}`);
    if (failed.length) console.warn(`entsoe: no data for ${failed.join(', ')}`);
    return events;
  },
};

// Returns the last data point of the last time series in a GL_MarketDocument.
export function latestPoint(xml) {
  let latest = null;
  for (const period of xml.matchAll(/<Period>([\s\S]*?)<\/Period>/g)) {
    const body = period[1];
    const start = /<start>([^<]+)<\/start>/.exec(body)?.[1];
    const minutes = RESOLUTION_MINUTES[/<resolution>([^<]+)<\/resolution>/.exec(body)?.[1]];
    if (!start || !minutes) continue;
    for (const point of body.matchAll(/<Point>\s*<position>(\d+)<\/position>\s*<quantity>([\d.]+)<\/quantity>/g)) {
      const time = new Date(Date.parse(start) + (Number(point[1]) - 1) * minutes * 60000);
      if (!latest || time > latest.time) latest = { time, megawatts: Number(point[2]) };
    }
  }
  return latest;
}

// ENTSO-E expects UTC as yyyyMMddHHmm, on full hours.
function entsoeTime(timestamp) {
  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

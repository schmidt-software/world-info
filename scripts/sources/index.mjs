// Snapshot sources, in panel order. Each module exports a default object:
// { id, label, color, pulse?, attribution, requiredEnv?, minIntervalMinutes?, fetch(env) }
// where fetch returns events in the normalized shape used by the page,
// `attribution` is the provider name shown in the page footer and
// `minIntervalMinutes` spaces out requests for sources with daily quotas.

import aisstream from './aisstream.mjs';
import meteoalarm from './meteoalarm.mjs';
import nasaFirms from './nasa-firms.mjs';
import opensky from './opensky.mjs';
import ticketmaster from './ticketmaster.mjs';
import tomtom from './tomtom.mjs';

export const sources = [
  meteoalarm,
  nasaFirms,
  opensky,
  aisstream,
  tomtom,
  ticketmaster,
];

// Snapshot sources, in panel order. Each module exports a default object:
// { id, label, color, pulse?, attribution, requiredEnv?, fetch(env) }
// where fetch returns events in the normalized shape used by the page and
// `attribution` is the provider name shown in the page footer.

import meteoalarm from './meteoalarm.mjs';

export const sources = [meteoalarm];

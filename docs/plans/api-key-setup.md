# Plan: API key registration and secrets

Status: open. Agreed on 2026-10-24, to be carried out later on another machine.

## Goal

Register with the eight providers of the key-based snapshot layers, store their
keys as GitHub repository secrets, and verify every layer with real data.

## Context

- The key-based layers are implemented and merged to `main` (PRs #4 to #6,
  2026-10-24). Only the registrations and the secrets are missing.
- `scripts/fetch-data.mjs` runs every snapshot source; a source whose key is
  missing is shown as "Not configured" in the panel. `.env.example` lists all
  variable names.
- The deploy workflow (`.github/workflows/pages.yml`) already passes every
  secret to the fetch step. It runs on every push to `main` and every 10
  minutes, so a newly stored secret takes effect with the next run.

## Division of work

The user registers. Claude does not create accounts, because registration
requires the user's private identity, acceptance of terms in the user's name,
e-mail confirmation and often a CAPTCHA.

Claude:

1. Opens each registration page in the user's browser, one at a time, in the
   order below, and explains what to create on it.
2. After all secrets are set, runs the fetch script and the workflow and
   verifies each layer (see Verification).

The user:

1. Registers with a **private** e-mail address. Never use the work address and
   never link the private `schmidt-software` GitHub account with the employer.
2. Stores each key directly as a secret by typing in the Claude Code prompt:
   `! gh secret set <NAME>`. `gh` asks for the value without echoing it, so the
   key never appears in the chat, the transcript or the repository.

## Providers

Ordered from quickest to slowest.

| # | Provider | Where | What to create | Secret name(s) |
|---|---|---|---|---|
| 1 | NASA FIRMS | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | Request a MAP_KEY with your e-mail; it arrives by mail | `NASA_FIRMS_MAP_KEY` |
| 2 | TomTom | https://developer.tomtom.com/user/login | Account, then the default API key in the dashboard | `TOMTOM_API_KEY` |
| 3 | Ticketmaster | https://developer-account.ticketmaster.com/user/register | Account; use the "Consumer Key" of the default app | `TICKETMASTER_API_KEY` |
| 4 | OpenAQ | https://explore.openaq.org/register | Account; API key in the account settings | `OPENAQ_API_KEY` |
| 5 | Windy Webcams | https://api.windy.com/keys | Account; create a key for the Webcams API (free tier) | `WINDY_WEBCAMS_API_KEY` |
| 6 | aisstream.io | https://aisstream.io/authenticate | Sign in with the `schmidt-software` GitHub account; create an API key | `AISSTREAM_API_KEY` |
| 7 | OpenSky Network | https://opensky-network.org/ | Account; then "API Client" on the account page (client id and secret) | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` |
| 8 | ENTSO-E | https://transparency.entsoe.eu/ | Register; then e-mail transparency@entsoe.eu with subject "Restful API access" and the account e-mail in the body; the token appears in the account settings once approved (can take several days) | `ENTSOE_SECURITY_TOKEN` |

Terms to be aware of before accepting: OpenSky allows non-commercial use only;
TomTom and Ticketmaster have daily quotas that the source intervals respect.

## Checklist

- [ ] NASA FIRMS key stored
- [ ] TomTom key stored
- [ ] Ticketmaster key stored
- [ ] OpenAQ key stored
- [ ] Windy Webcams key stored
- [ ] aisstream.io key stored
- [ ] OpenSky client id and secret stored
- [ ] ENTSO-E token requested
- [ ] ENTSO-E token stored
- [ ] All layers verified with real data

## Verification (Claude)

1. `gh secret list` shows the expected names (values are never readable).
2. Run the deploy workflow (`gh workflow run pages.yml`), wait for it, and
   check the fetch step in its log: every configured source should report `ok`
   with a plausible event count; failures appear as `::warning` lines.
3. Check `https://schmidt-software.github.io/world-info/data/manifest.json`
   and the live page: configured layers load, no console errors.
4. Optional local check, for example while debugging a single source: the user
   puts keys into a git-ignored `.env`, then
   `node --env-file-if-exists=.env scripts/fetch-data.mjs <source-id>`.
   Serve `site/` on port 8123 for the user's review. Never commit `.env`.
5. Fixes found during verification go through a normal pull request.
6. Open points to settle with real data:
   - Windy: the `bbox` parameter order (north, east, south, west) is unverified;
     fix it if the layer comes back empty or with a 400.
   - OpenSky may restrict requests from cloud networks such as GitHub Actions.
     If the layer fails only in the workflow, report it to the user and discuss
     alternatives (for example adsb.fi, which needs no key but sends no CORS
     headers).
   - aisstream.io: check that 45 seconds of listening yield a useful number of
     ships and that the data file stays reasonably small.
7. Tick the checklist above, and set the status of this plan to done once all
   layers work.

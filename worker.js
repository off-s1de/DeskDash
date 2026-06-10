/*
  Smart Display — Cloudflare Worker Proxy
  ═══════════════════════════════════════
  Settings → Variables → add:
    FOOTBALL_API_KEY  =  your key from football-data.org
    ADSBX_API_KEY     =  your key from adsbexchange.com/data (free rapid-api tier)
                         OR leave blank to use OpenSky as fallback
*/

export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    const url  = new URL(request.url);
    const path = url.pathname;
    const qs   = url.search;

    /* ── /football/* → football-data.org ── */
    if (path.startsWith('/football/')) {
      const apiPath = path.replace('/football', '');
      const upstream = `https://api.football-data.org/v4${apiPath}${qs}`;
      try {
        const resp = await fetch(upstream, {
          headers: { 'X-Auth-Token': env.FOOTBALL_API_KEY },
          signal: AbortSignal.timeout(8000)
        });
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...cors() }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'football-data timeout', detail: e.message }), {
          status: 504, headers: { 'Content-Type': 'application/json', ...cors() }
        });
      }
    }

    /* ── /flights → ADS-B Exchange (RapidAPI, free tier) ── */
    /* Get a free key at https://rapidapi.com/adsbx/api/adsbx-flights          */
    /* Free tier: 1000 calls/month — more than enough for a shelf display       */
    if (path.startsWith('/flights')) {
      const params = new URLSearchParams(qs);
      const lat = params.get('lat') || '13.02';
      const lon = params.get('lon') || '77.59';
      const dist = params.get('dist') || '50'; // nm radius

      if (env.ADSBX_API_KEY) {
        try {
          const upstream = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${lat}/lon/${lon}/dist/${dist}/`;
          const resp = await fetch(upstream, {
            headers: {
              'x-rapidapi-host': 'adsbexchange-com1.p.rapidapi.com',
              'x-rapidapi-key': env.ADSBX_API_KEY
            },
            signal: AbortSignal.timeout(8000)
          });
          const data = await resp.json();
          /* Normalise to a simple array so dashboard code stays the same */
          const aircraft = (data.ac || []).map(a => ({
            callsign:  a.flight ? a.flight.trim() : (a.r || ''),
            country:   a.cou || a.r || '?',
            altitude:  a.alt_baro ? Math.round(a.alt_baro * 0.3048) : null, // ft→m
            speed:     a.gs ? Math.round(a.gs * 1.852) : null,              // kts→km/h
            on_ground: a.alt_baro === 'ground',
            lat:       a.lat,
            lon:       a.lon,
          }));
          return new Response(JSON.stringify({ aircraft, source: 'adsbx' }), {
            headers: { 'Content-Type': 'application/json', ...cors() }
          });
        } catch (e) {
          /* fall through to OpenSky */
        }
      }

      /* ── Fallback: OpenSky (less reliable, but free & keyless) ── */
      try {
        const delta = 0.5;
        const oqs = `?lamin=${parseFloat(lat)-delta}&lomin=${parseFloat(lon)-delta}&lamax=${parseFloat(lat)+delta}&lomax=${parseFloat(lon)+delta}`;
        const resp = await fetch(`https://opensky-network.org/api/states/all${oqs}`, {
          signal: AbortSignal.timeout(10000)
        });
        const data = await resp.json();
        const aircraft = (data.states || []).filter(s => s[1]).map(s => ({
          callsign:  (s[1] || '').trim(),
          country:   s[2] || '?',
          altitude:  s[7] ? Math.round(s[7]) : null,  // already metres
          speed:     s[9] ? Math.round(s[9] * 3.6) : null, // m/s→km/h
          on_ground: s[8] || false,
          lat:       s[6],
          lon:       s[5],
        }));
        return new Response(JSON.stringify({ aircraft, source: 'opensky' }), {
          headers: { 'Content-Type': 'application/json', ...cors() }
        });
      } catch (e) {
        return new Response(JSON.stringify({ aircraft: [], error: 'all flight sources unavailable' }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...cors() }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: cors() });
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

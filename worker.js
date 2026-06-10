/*
  Smart Display — Cloudflare Worker Proxy
  ═══════════════════════════════════════
  Deploy steps:
  1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
  2. Paste this entire file into the editor
  3. Click Settings → Variables → add:
       FOOTBALL_API_KEY  =  your key from football-data.org
  4. Deploy. Copy your worker URL (e.g. https://smart-display.YOUR-NAME.workers.dev)
  5. Paste that URL into index.html as PROXY_BASE
*/

export default {
  async fetch(request, env) {

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    const url  = new URL(request.url);
    const path = url.pathname; // e.g. /football/competitions/PD/standings
    const qs   = url.search;   // query string passthrough

    /* ── Route: /football/* → football-data.org ── */
    if (path.startsWith('/football/')) {
      const apiPath = path.replace('/football', '');
      const upstream = `https://api.football-data.org/v4${apiPath}${qs}`;
      const resp = await fetch(upstream, {
        headers: { 'X-Auth-Token': env.FOOTBALL_API_KEY }
      });
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...cors() }
      });
    }

    /* ── Route: /opensky → OpenSky Network ── */
    if (path.startsWith('/opensky')) {
      const upstream = `https://opensky-network.org/api/states/all${qs}`;
      const resp = await fetch(upstream);
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...cors() }
      });
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

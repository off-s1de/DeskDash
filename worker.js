/*
  DeskDash Cloudflare Worker
  --------------------------
  Required Variables:

  FOOTBALL_API_KEY = your football-data.org API key
*/

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors()
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const qs = url.search;

    /*
    ────────────────────────────────────────────────
    FOOTBALL-DATA PROXY
    ────────────────────────────────────────────────
    */

    if (path.startsWith("/football/")) {

      const apiPath =
        path.replace("/football", "");

      const upstream =
        `https://api.football-data.org/v4${apiPath}${qs}`;

      try {

        const resp =
          await fetch(
            upstream,
            {
              headers: {
                "X-Auth-Token":
                  env.FOOTBALL_API_KEY
              },
              signal:
                AbortSignal.timeout(8000)
            }
          );

        const body =
          await resp.text();

        return new Response(
          body,
          {
            status: resp.status,
            headers: {
              "Content-Type":
                "application/json",
              ...cors()
            }
          }
        );

      } catch (e) {

        return new Response(
          JSON.stringify({
            error:
              "football-data timeout",
            detail:
              e.message
          }),
          {
            status: 504,
            headers: {
              "Content-Type":
                "application/json",
              ...cors()
            }
          }
        );

      }
    }

    /*
    ────────────────────────────────────────────────
    FLIGHTS (adsb.lol)
    ────────────────────────────────────────────────
    */

    if (path.startsWith("/flights")) {

      const params =
        new URLSearchParams(qs);

      const lat =
        params.get("lat") ||
        "13.1986";

      const lon =
        params.get("lon") ||
        "77.7066";

      const dist =
        params.get("dist") ||
        "100";

      try {

        const resp =
          await fetch(
            `https://api.adsb.lol/v2/point/${lat}/${lon}/${dist}`,
            {
              signal:
                AbortSignal.timeout(8000)
            }
          );

        if (!resp.ok) {
          throw new Error(
            `adsb.lol returned ${resp.status}`
          );
        }

        const data =
          await resp.json();

        const aircraft =
          (data.ac || [])
            .map(a => ({

              callsign:
                a.flight?.trim() ||
                a.hex ||
                "",

              country:
                a.r ||
                "Unknown",

              altitude:
                typeof a.alt_baro === "number"
                  ? Math.round(a.alt_baro)
                  : null,

              speed:
                a.gs
                  ? Math.round(a.gs)
                  : null,

              on_ground:
                a.alt_baro === "ground",

              lat: a.lat,
              lon: a.lon

            }))
            .filter(
              a => a.callsign
            );

        return new Response(
          JSON.stringify({
            aircraft,
            source: "adsb.lol"
          }),
          {
            headers: {
              "Content-Type":
                "application/json",
              ...cors()
            }
          }
        );

      } catch (e) {

        return new Response(
          JSON.stringify({
            aircraft: [],
            source: "adsb.lol",
            error: e.message
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
              ...cors()
            }
          }
        );

      }
    }

    /*
    ────────────────────────────────────────────────
    404
    ────────────────────────────────────────────────
    */

    return new Response(
      JSON.stringify({
        error: "Not found"
      }),
      {
        status: 404,
        headers: {
          "Content-Type":
            "application/json",
          ...cors()
        }
      }
    );
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type"
  };
}

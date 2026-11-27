// /api/tipjar — the "bribe the ref" jar. Everyone who visits shares the same jar for each game.
// GET  ?k=<jar>          -> { ok, k, count }
// POST { k, n }          -> adds n coins (1-10, the page batches taps) and returns the new count
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const okKey = k => typeof k === "string" && /^[a-z0-9-]{1,40}$/.test(k);

export async function onRequestGet({ request, env }) {
  if (!env.ATTENDANCE) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  const k = new URL(request.url).searchParams.get("k");
  if (!okKey(k)) return json({ ok: false, error: "Bad jar." }, 400);
  return json({ ok: true, k, count: +(await env.ATTENDANCE.get("tip:" + k)) || 0 });
}

export async function onRequestPost({ request, env }) {
  if (!env.ATTENDANCE) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  let b; try { b = JSON.parse(await request.text()); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  const n = Math.floor(+b.n);
  if (!okKey(b.k) || !(n >= 1 && n <= 10)) return json({ ok: false, error: "Bad request." }, 400);
  const key = "tip:" + b.k, count = (+(await env.ATTENDANCE.get(key)) || 0) + n;
  await env.ATTENDANCE.put(key, String(count), { expirationTtl: 60 * 60 * 24 * 400 });
  return json({ ok: true, k: b.k, count });
}

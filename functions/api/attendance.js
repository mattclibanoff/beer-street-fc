// /api/attendance — In/Out for the next game.
// GET  ?date=YYYY-MM-DD           -> { ok, date, answers: { "Ben M.": { s: "in"|"out", t } } }
// POST { key, date, name, status } -> saves one answer. The private team link carries the key;
//                                     only its SHA-256 hash is stored here, so the repo never holds the key.
const KEY_HASH = "c14ffba6f76c3aa485159f3e9c5716c322ae8514dc966787ce6a6e082e220777";
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
const okName = n => typeof n === "string" && /^[\p{L}\p{M} .'-]{1,40}$/u.test(n);
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env }) {
  if (!env.ATTENDANCE) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  const date = new URL(request.url).searchParams.get("date");
  if (!okDate(date)) return json({ ok: false, error: "Bad date." }, 400);
  return json({ ok: true, date, answers: (await env.ATTENDANCE.get("att:" + date, "json")) || {} });
}

export async function onRequestPost({ request, env }) {
  if (!env.ATTENDANCE) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  let b; try { b = JSON.parse(await request.text()); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  if (typeof b.key !== "string" || (await sha(b.key)) !== KEY_HASH) return json({ ok: false, error: "This link isn't valid." }, 401);
  if (!okDate(b.date) || !okName(b.name) || !["in", "out", "clear"].includes(b.status)) return json({ ok: false, error: "Bad request." }, 400);
  const k = "att:" + b.date, answers = (await env.ATTENDANCE.get(k, "json")) || {};
  if (b.status === "clear") delete answers[b.name]; else answers[b.name] = { s: b.status, t: new Date().toISOString() };
  await env.ATTENDANCE.put(k, JSON.stringify(answers), { expirationTtl: 60 * 60 * 24 * 60 }); // tidy up after ~2 months
  return json({ ok: true, answers });
}

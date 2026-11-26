// POST /api/submit  — the tally app's "Send to site" button.
// Body: { code, game: { date, opp, us, them, other, field: [...], keepers: [...] } }
// Shared helpers for the stat submission API (Cloudflare Pages Functions + KV).
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Constant-time comparison of the owner code (set as the SUBMIT_CODE secret in Cloudflare).
async function codeOk(env, given) {
  if (!env.SUBMIT_CODE || typeof given !== "string" || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, env.SUBMIT_CODE].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const FIELD = ["goals","assists","shots","plus","minus","takeaways","giveaways","blocks","fouls","yellow","red"];
const KEEP = ["saves","ga"];
const int = v => Number.isInteger(v) && v >= 0 && v <= 99;
const name = v => typeof v === "string" && v.trim().length > 0 && v.length <= 40;

function clean(game) {
  if (!game || typeof game !== "object") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date || "")) return null;
  if (!int(game.us) || !int(game.them) || !int(game.other || 0)) return null;
  const rows = (list, keys) => Array.isArray(list) && list.length <= 30 && list.every(p => p && name(p.name) && keys.every(k => int(p[k] || 0)))
    ? list.map(p => ({ name: p.name.trim(), played: !!p.played, ...Object.fromEntries(keys.map(k => [k, p[k] || 0])) })) : null;
  const field = rows(game.field, FIELD), keepers = rows(game.keepers, KEEP);
  if (!field || !keepers) return null;
  return { date: game.date, opp: String(game.opp || "").slice(0, 60), us: game.us, them: game.them, other: game.other || 0, field, keepers };
}

export async function onRequestPost({ request, env }) {
  if (!env.SUBMISSIONS) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  const raw = await request.text();
  if (raw.length > 20000) return json({ ok: false, error: "Too large." }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  if (!(await codeOk(env, body.code))) return json({ ok: false, error: "Wrong code." }, 401);
  const game = clean(body.game);
  if (!game) return json({ ok: false, error: "Those stats didn't look right." }, 422);
  const id = `${game.date}-${Date.now().toString(36)}`;
  await env.SUBMISSIONS.put(`sub:${id}`, JSON.stringify({ id, receivedAt: new Date().toISOString(), game }));
  return json({ ok: true, id });
}

export const onRequest = () => json({ ok: false, error: "Use POST." }, 405);

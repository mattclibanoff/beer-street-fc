// GET /api/submissions  — newest first; read by the daily site update.
// DELETE /api/submissions?id=...  with header X-Code — removes one (owner only).
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

export async function onRequestGet({ env }) {
  if (!env.SUBMISSIONS) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  const { keys } = await env.SUBMISSIONS.list({ prefix: "sub:", limit: 100 });
  const items = (await Promise.all(keys.map(k => env.SUBMISSIONS.get(k.name, "json")))).filter(Boolean);
  items.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return json({ ok: true, submissions: items });
}

export async function onRequestDelete({ request, env }) {
  if (!env.SUBMISSIONS) return json({ ok: false, error: "Storage is not set up yet." }, 503);
  if (!(await codeOk(env, request.headers.get("x-code")))) return json({ ok: false, error: "Wrong code." }, 401);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[\w-]{1,60}$/.test(id)) return json({ ok: false, error: "Bad id." }, 400);
  await env.SUBMISSIONS.delete(`sub:${id}`);
  return json({ ok: true });
}

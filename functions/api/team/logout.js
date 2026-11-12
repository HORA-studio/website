// POST /api/team/logout — xoa phien tren server + xoa cookie.
import { json } from "../_lib.js";
import { sha256Hex } from "../_lib.js";
import { ensureSchema } from "./_team.js";

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(/team_session=([a-f0-9]+)/);
  if (m) {
    await env.DB.prepare("DELETE FROM team_sessions WHERE token_hash = ?1")
      .bind(await sha256Hex(m[1])).run();
  }
  return json({ ok: true }, 200, {
    "Set-Cookie": "team_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  });
}

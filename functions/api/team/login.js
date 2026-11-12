// POST /api/team/login { name, code } — vao phong bang ma rieng.
import { json, errorJson, readJson, sha256Hex } from "../_lib.js";
import { ensureSchema, createSession, sessionCookie, logAccess } from "./_team.js";

export async function onRequestPost({ request, env }) {
  await ensureSchema(env);
  const body = await readJson(request);
  const name = String(body?.name || "").trim();
  const code = String(body?.code || "").trim().toUpperCase();
  if (!name || !code) return errorJson("BAD_INPUT", "Thiếu tên hoặc mã.", 400);

  // Khoa tam thoi: >10 lan sai trong 10 phut cho cung 1 ten.
  const { results: fails } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM team_access_log WHERE name = ?1 AND ok = 0 AND created_at > datetime('now', '-10 minutes')"
  ).bind(name).all();
  if ((fails?.[0]?.n ?? 0) >= 10) {
    return errorJson("TOO_MANY", "Quá nhiều lần nhập sai. Đợi 10 phút rồi thử lại.", 429);
  }

  const { results } = await env.DB.prepare(
    "SELECT name, role, revoked, code_hash FROM team_members WHERE name = ?1"
  ).bind(name).all();
  const m = results?.[0];
  const hash = await sha256Hex(code);
  if (!m || m.revoked || m.code_hash !== hash) {
    await logAccess(env, name, false);
    return errorJson("BAD_CODE", "Tên hoặc mã không đúng (hoặc mã đã bị thu hồi).", 401);
  }
  await logAccess(env, name, true);
  await env.DB.prepare("UPDATE team_members SET last_seen_at = datetime('now') WHERE name = ?1")
    .bind(name).run();
  const token = await createSession(env, name);
  return json({ name: m.name, role: m.role }, 200, { "Set-Cookie": sessionCookie(token) });
}

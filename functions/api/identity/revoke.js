// POST /api/identity/revoke { token } — VB worker goi khi khach "ngat ket noi"
// trong app. Xac thuc bang X-Identity-Secret.
import { json, errorJson, readJson, sha256Hex } from "../_lib.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  const token = String((body && body.token) || "").trim();
  if (!token) return errorJson("INVALID_TOKEN", "Thiếu token.", 422);

  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    "UPDATE app_tokens SET revoked_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL"
  ).bind(tokenHash, new Date().toISOString()).run();

  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

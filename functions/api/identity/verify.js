// POST /api/identity/verify { token } — VB worker goi (server-to-server) de doi
// token app -> userId. Xac thuc bang header X-Identity-Secret.
// Tra ve { userId, email, app }, hoac 401 neu token sai/thu hoi/het han.
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
  const row = await env.DB.prepare(
    `SELECT t.customer_id, t.app, t.device_id, t.revoked_at, c.email
       FROM app_tokens t JOIN customers c ON c.id = t.customer_id
      WHERE t.token_hash = ?1`
  ).bind(tokenHash).first();

  if (!row || row.revoked_at) return errorJson("INVALID_TOKEN", "Token không hợp lệ hoặc đã bị thu hồi.", 401);

  return json({ userId: row.customer_id, email: row.email, app: row.app, deviceId: row.device_id || null });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

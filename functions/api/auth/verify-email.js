// POST /api/auth/verify-email { token } — xac thuc email bang token trong
// link gui qua email (purpose 'verify_email', han 24h, dung 1 lan).
import { json, errorJson, readJson, consumeAuthToken } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const token = String(body.token || "");
  const result = await consumeAuthToken(env, token, "verify_email");
  if (!result.ok) {
    const message = result.code === "TOKEN_EXPIRED"
      ? "Link xác thực đã hết hạn. Hãy đăng nhập và gửi lại email xác thực."
      : "Link xác thực không hợp lệ hoặc đã được dùng.";
    return errorJson(result.code, message, 400);
  }

  await env.DB.prepare("UPDATE customers SET email_verified_at = ?1 WHERE id = ?2")
    .bind(new Date().toISOString(), result.customerId).run();
  await logEvent(env, { eventType: "auth.email_verified", customerId: result.customerId, ip: clientIp(request) });
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

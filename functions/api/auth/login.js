// POST /api/auth/login — dang nhap bang email + mat khau.
import { json, errorJson, readJson, verifyPassword, createSession } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const row = await env.DB.prepare(
    "SELECT id, email, password_hash, salt, iterations, display_name FROM customers WHERE email = ?1"
  ).bind(email).first();

  // Thong bao chung cho ca email khong ton tai lan sai mat khau.
  if (!row) return errorJson("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.", 401);
  const ok = await verifyPassword(password, row.password_hash, row.salt, row.iterations);
  if (!ok) return errorJson("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.", 401);

  const session = await createSession(env, row.id);
  await logEvent(env, { eventType: "auth.login", customerId: row.id, ip: clientIp(request) });
  return json(
    { customer: { id: row.id, email: row.email, displayName: row.display_name } },
    200,
    { "Set-Cookie": session.cookie }
  );
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

// POST /api/auth/register — dang ky tai khoan khach (email + mat khau >= 8 ky tu).
import { json, errorJson, readJson, hashPassword, createSession } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const displayName = String(body.displayName || body.display_name || "").trim().slice(0, 80) || null;

  if (!EMAIL_RE.test(email)) return errorJson("INVALID_EMAIL", "Email không đúng định dạng.", 422);
  if (password.length < 8) return errorJson("WEAK_PASSWORD", "Mật khẩu cần ít nhất 8 ký tự.", 422);

  const existing = await env.DB.prepare("SELECT id FROM customers WHERE email = ?1").bind(email).first();
  if (existing) return errorJson("EMAIL_EXISTS", "Email này đã được đăng ký.", 409);

  const { hash, salt, iterations } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO customers (id, email, password_hash, salt, iterations, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
  ).bind(id, email, hash, salt, iterations, displayName, new Date().toISOString()).run();

  const session = await createSession(env, id);
  await logEvent(env, { eventType: "auth.register", customerId: id, ip: clientIp(request) });
  return json(
    { customer: { id, email, displayName } },
    201,
    { "Set-Cookie": session.cookie }
  );
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

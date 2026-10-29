// POST /api/auth/register — dang ky tai khoan khach (email + mat khau >= 8 ky tu).
// Sau khi tao tai khoan: phat token xac thuc email + gui mail qua Resend.
// Chua cau hinh mail (RESEND_API_KEY de trong) thi buoc gui bi bo qua —
// dang ky van thanh cong binh thuong (xem functions/api/_mail.js).
import { json, errorJson, readJson, hashPassword, createSession, issueAuthToken, siteUrl } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { isMailConfigured, sendVerificationEmail } from "../_mail.js";

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

  // Gui email xac thuc (token 24h, dung 1 lan). Moi loi o buoc nay deu bi
  // nuot — dang ky da thanh cong thi khong duoc vo chi vi mail/token loi
  // (vd DB chua ap migration auth_tokens).
  const mailConfigured = isMailConfigured(env);
  try {
    const verifyToken = await issueAuthToken(env, id, "verify_email", 24 * 3600 * 1000);
    const link = `${siteUrl(env)}/account.html?verify=${verifyToken}`;
    await sendVerificationEmail(env, { to: email, customerId: id, link });
  } catch (err) {
    console.warn("register: send verification email failed:", err && err.message ? err.message : String(err));
  }

  return json(
    { customer: { id, email, displayName, emailVerified: false }, mailConfigured },
    201,
    { "Set-Cookie": session.cookie }
  );
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

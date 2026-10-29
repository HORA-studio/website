// POST /api/auth/forgot-password { email } — gui link dat lai mat khau.
// LUON tra 200 { ok:true } bat ke email co ton tai hay khong (chong do
// email dang ky). Email ton tai -> phat reset token (han 1 gio, dung 1 lan)
// va gui qua Resend; chua cau hinh mail thi buoc gui bi bo qua (van 200).
import { json, errorJson, readJson, issueAuthToken, siteUrl } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { sendPasswordResetEmail } from "../_mail.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const email = String(body.email || "").trim().toLowerCase();
  try {
    if (email) {
      const row = await env.DB.prepare("SELECT id FROM customers WHERE email = ?1").bind(email).first();
      if (row) {
        const token = await issueAuthToken(env, row.id, "reset_password", 3600 * 1000);
        const link = `${siteUrl(env)}/account.html?reset=${token}`;
        await sendPasswordResetEmail(env, { to: email, customerId: row.id, link });
        await logEvent(env, { eventType: "auth.password_forgot", customerId: row.id, ip: clientIp(request) });
      }
    }
  } catch (err) {
    // Nuot loi: response khong duoc phan biet email ton tai / khong ton tai.
    console.warn("forgot-password failed:", err && err.message ? err.message : String(err));
  }
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

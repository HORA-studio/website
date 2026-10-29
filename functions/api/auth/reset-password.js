// POST /api/auth/reset-password { token, password } — dat mat khau moi bang
// reset token (han 1 gio, dung 1 lan). Thanh cong: doi hash mat khau va THU
// HOI toan bo session cua khach (dang xuat moi thiet bi/trinh duyet).
import { json, errorJson, readJson, consumeAuthToken, hashPassword } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const token = String(body.token || "");
  const password = String(body.password || "");
  if (password.length < 8) return errorJson("WEAK_PASSWORD", "Mật khẩu cần ít nhất 8 ký tự.", 422);

  const result = await consumeAuthToken(env, token, "reset_password");
  if (!result.ok) {
    const message = result.code === "TOKEN_EXPIRED"
      ? "Link đặt lại mật khẩu đã hết hạn. Hãy yêu cầu link mới."
      : "Link đặt lại mật khẩu không hợp lệ hoặc đã được dùng.";
    return errorJson(result.code, message, 400);
  }

  const { hash, salt, iterations } = await hashPassword(password);
  await env.DB.prepare(
    "UPDATE customers SET password_hash = ?1, salt = ?2, iterations = ?3 WHERE id = ?4"
  ).bind(hash, salt, iterations, result.customerId).run();

  // Thu hoi moi session dang con cua khach.
  await env.DB.prepare("DELETE FROM sessions WHERE customer_id = ?1").bind(result.customerId).run();

  await logEvent(env, { eventType: "auth.password_reset", customerId: result.customerId, ip: clientIp(request) });
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

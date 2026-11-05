// POST /api/auth/change-password { currentPassword, newPassword } — doi
// mat khau khi dang dang nhap. Doi xong thu hoi moi phien KHAC, giu phien
// hien tai. Tai khoan tao bang Google co mat khau ngau nhien khong ai biet
// -> doi o day khong duoc thi dung "Quen mat khau" de dat mat khau moi.
import { json, errorJson, readJson, getSessionCustomer, hashPassword, verifyPassword, parseCookies, sha256Hex, SESSION_COOKIE } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 8) return errorJson("WEAK_PASSWORD", "Mật khẩu mới cần ít nhất 8 ký tự.", 422);
  if (newPassword === currentPassword) return errorJson("SAME_PASSWORD", "Mật khẩu mới phải khác mật khẩu hiện tại.", 422);

  const row = await env.DB.prepare("SELECT password_hash, salt, iterations FROM customers WHERE id = ?1")
    .bind(customer.id).first();
  if (!row) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const okPw = await verifyPassword(currentPassword, row.password_hash, row.salt, row.iterations);
  if (!okPw) return errorJson("WRONG_PASSWORD", "Mật khẩu hiện tại chưa đúng.", 403);

  const { hash, salt, iterations } = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE customers SET password_hash = ?1, salt = ?2, iterations = ?3 WHERE id = ?4")
    .bind(hash, salt, iterations, customer.id).run();

  // Thu hoi phien o noi khac, giu phien dang doi mat khau.
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare("DELETE FROM sessions WHERE customer_id = ?1 AND token_hash != ?2")
      .bind(customer.id, tokenHash).run();
  } else {
    await env.DB.prepare("DELETE FROM sessions WHERE customer_id = ?1").bind(customer.id).run();
  }
  await logEvent(env, { eventType: "auth.password_changed", customerId: customer.id, ip: clientIp(request) });
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

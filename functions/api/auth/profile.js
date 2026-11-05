// POST /api/auth/profile { displayName, phone } — cap nhat thong tin ca
// nhan cua tai khoan dang dang nhap. Email KHONG doi o day (email la dinh
// danh dang nhap). Cot phone fail-soft: DB chua chay migration thi chi
// luu ten, khong loi.
import { json, errorJson, readJson, getSessionCustomer } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const displayName = String(body.displayName ?? "").trim().slice(0, 80);
  // phone chi cap nhat khi client gui kem (trang tai khoan khong con o SDT
  // — tu luu ten khong duoc xoa phone da luu truoc do).
  const hasPhone = body.phone !== undefined;
  const phone = hasPhone ? String(body.phone ?? "").trim().slice(0, 20) : null;
  if (hasPhone && phone && !/^[0-9+().\s-]+$/.test(phone)) {
    return errorJson("BAD_PHONE", "Số điện thoại chưa đúng định dạng.", 422);
  }
  if (hasPhone) {
    try {
      await env.DB.prepare("UPDATE customers SET display_name = ?2, phone = ?3 WHERE id = ?1")
        .bind(customer.id, displayName || null, phone || null).run();
    } catch {
      // DB chua co cot phone -> luu rieng ten
      await env.DB.prepare("UPDATE customers SET display_name = ?2 WHERE id = ?1")
        .bind(customer.id, displayName || null).run();
    }
  } else {
    await env.DB.prepare("UPDATE customers SET display_name = ?2 WHERE id = ?1")
      .bind(customer.id, displayName || null).run();
  }
  await logEvent(env, { eventType: "auth.profile_updated", customerId: customer.id, ip: clientIp(request) });
  return json({ ok: true, customer: { displayName, phone } });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

// POST /api/auth/google/unlink — huy lien ket Google cua tai khoan dang
// dang nhap. Sau khi huy, khach van vao duoc bang email + mat khau; dang
// nhap lai bang Google cung email tai khoan se tu gan lai lien ket.
import { json, errorJson, getSessionCustomer } from "../../_lib.js";
import { unlinkGoogle } from "../../_google.js";

export async function onRequestPost({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const r = await unlinkGoogle(env, request, customer.id);
  if (!r.ok) {
    return errorJson("LINK_UNAVAILABLE", "Chưa hủy liên kết Google được (hệ thống chưa sẵn sàng). Hãy thử lại sau.", 400);
  }
  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

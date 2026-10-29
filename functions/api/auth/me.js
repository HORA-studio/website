// GET /api/auth/me — thong tin khach dang dang nhap (401 neu chua dang nhap).
// Kem emailVerified (tu customers.email_verified_at). Dang nhap KHONG bi
// chan khi chua xac thuc email — xac thuc chi la nhac nho (soft) luc nay.
import { json, errorJson, getSessionCustomer, getEmailVerifiedAt } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const verifiedAt = await getEmailVerifiedAt(env, customer.id);
  return json({ customer: { ...customer, emailVerified: !!verifiedAt } });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

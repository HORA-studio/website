// GET /api/auth/me — thong tin khach dang dang nhap (401 neu chua dang nhap).
// Kem emailVerified (tu customers.email_verified_at). Dang nhap KHONG bi
// chan khi chua xac thuc email — xac thuc chi la nhac nho (soft) luc nay.
import { json, errorJson, getSessionCustomer, getEmailVerifiedAt } from "../_lib.js";
import { getGoogleLink } from "../_google.js";

export async function onRequestGet({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  const verifiedAt = await getEmailVerifiedAt(env, customer.id);
  const google = await getGoogleLink(env, customer.id);
  // phone + avatar_url: fail-soft khi DB chua chay migration profile.
  let phone = null, avatarUrl = null;
  try {
    const row = await env.DB.prepare("SELECT phone, avatar_url FROM customers WHERE id = ?1").bind(customer.id).first();
    if (row) { phone = row.phone || null; avatarUrl = row.avatar_url || null; }
  } catch { /* chua co cot -> de null */ }
  return json({ customer: { ...customer, emailVerified: !!verifiedAt, googleLinked: google.linked, googleEmail: google.email, phone, avatarUrl } });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

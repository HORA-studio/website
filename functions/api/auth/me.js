// GET /api/auth/me — thong tin khach dang dang nhap (401 neu chua dang nhap).
import { json, errorJson, getSessionCustomer } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const customer = await getSessionCustomer(env, request);
  if (!customer) return errorJson("UNAUTHORIZED", "Bạn chưa đăng nhập.", 401);
  return json({ customer });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

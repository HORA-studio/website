// GET /api/licenses — danh sach license cua khach dang dang nhap.
// Key claim chi luu hash, tier/han dung NULL -> UI hien "Chua dong bo".
import { json, errorJson, requireAuth } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const { results } = await env.DB.prepare(
    `SELECT id, license_key_plain, product, tier, expires_at, source, order_id, created_at
       FROM customer_licenses WHERE customer_id = ?1 ORDER BY created_at DESC`
  ).bind(a.customer.id).all();

  const licenses = (results || []).map((r) => ({
    id: r.id,
    product: r.product,
    tier: r.tier,
    expiresAt: r.expires_at,
    source: r.source,
    orderId: r.order_id,
    // Chi key mua qua web (he thong cap) moi co ban tho de khach copy; key claim -> null.
    licenseKeyPlain: r.license_key_plain || null,
    syncStatus: r.tier ? "synced" : "not_synced",
    createdAt: r.created_at,
  }));
  return json({ licenses });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

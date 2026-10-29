// GET /api/licenses — danh sach license cua khach dang dang nhap (cho dashboard).
import { json, errorJson, requireAuth } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const { results } = await env.DB.prepare(
    `SELECT l.id, l.license_key, l.app, l.product_id, l.tier, l.status, l.organization,
            l.expiry_utc, l.validity_days, l.activated_at, l.revoked_at, l.source, l.order_id, l.created_at,
            (SELECT d.device_id FROM devices d WHERE d.license_id = l.id LIMIT 1) AS device_id
       FROM licenses l WHERE l.customer_id = ?1 ORDER BY l.created_at DESC`
  ).bind(a.customer.id).all();

  const licenses = (results || []).map((r) => ({
    id: r.id,
    licenseKey: r.license_key,
    app: r.app,
    product: r.product_id,
    tier: r.tier,
    status: r.status,
    organization: r.organization,
    expiresAt: r.expiry_utc,
    activatedAt: r.activated_at,
    source: r.source,
    orderId: r.order_id,
    deviceBound: Boolean(r.device_id),
    createdAt: r.created_at,
  }));
  return json({ licenses });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

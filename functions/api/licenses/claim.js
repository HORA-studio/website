// POST /api/licenses/claim { key, app } — khach dan license key da co (mua truoc
// day / do admin cap tay) de gan vao tai khoan web cua minh.
// Neu key chua co trong DB web (do admin cap o he cu) thi tao ban ghi 'claim'.
import { json, errorJson, readJson, requireAuth, LICENSE_KEY_RE, newLicenseId } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const key = String(body.key || "").trim().toUpperCase();
  const app = String(body.app || "video-builder").trim();
  if (!LICENSE_KEY_RE.test(key)) {
    return errorJson("INVALID_KEY_FORMAT", "License key không đúng định dạng (ví dụ HORA_0123ABCD... 32 ký tự hex).", 422);
  }

  const existing = await env.DB.prepare("SELECT * FROM licenses WHERE license_key = ?1").bind(key).first();
  if (existing) {
    if (existing.customer_id === a.customer.id) {
      return errorJson("LICENSE_ALREADY_CLAIMED", "License này đã có trong tài khoản của bạn.", 409);
    }
    return errorJson("LICENSE_TAKEN", "License này đã thuộc tài khoản khác.", 409);
  }

  const now = new Date().toISOString();
  const id = newLicenseId();
  const tier = String(body.tier || "").toLowerCase();
  const validTiers = ["go", "plus", "pro"];
  await env.DB.prepare(
    `INSERT INTO licenses
       (id, license_key, customer_id, app, product_id, tier, status, organization,
        expiry_utc, validity_days, activated_at, revoked_at, source, order_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?4, ?5, 'active', 'user', NULL, 30, NULL, NULL, 'claim', NULL, ?6)`
  ).bind(id, key, a.customer.id, app, validTiers.includes(tier) ? tier : "go", now).run();

  await logEvent(env, { eventType: "license.claim", customerId: a.customer.id, ip: clientIp(request), details: { app } });
  return json({ license: { id, licenseKey: key, app, tier: validTiers.includes(tier) ? tier : "go", syncStatus: "synced" } }, 201);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

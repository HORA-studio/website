// POST /api/licenses/claim {key} — nhan mot license key da co ve tai khoan.
// Chi luu SHA-256 cua key (KHONG luu key tho). He license chua co endpoint
// tra cuu key cho website nen tier/han dung de NULL = "Chua dong bo" —
// tuyet doi khong tu bia tier cho key claim.
import { json, errorJson, readJson, requireAuth, sha256Hex, LICENSE_KEY_RE } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const key = String(body.key || "").trim().toUpperCase();
  if (!LICENSE_KEY_RE.test(key)) {
    return errorJson("INVALID_KEY_FORMAT", "License key không đúng định dạng (ví dụ HORA_0123ABCD... 32 ký tự hex).", 422);
  }

  const keyHash = await sha256Hex(key);
  const existing = await env.DB.prepare(
    "SELECT id FROM customer_licenses WHERE customer_id = ?1 AND license_key_hash = ?2"
  ).bind(a.customer.id, keyHash).first();
  if (existing) return errorJson("LICENSE_ALREADY_CLAIMED", "License này đã có trong tài khoản của bạn.", 409);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO customer_licenses
       (id, customer_id, license_key_hash, license_key_plain, product, tier, expires_at, source, order_id, created_at)
     VALUES (?1, ?2, ?3, NULL, NULL, NULL, NULL, 'claim', NULL, ?4)`
  ).bind(id, a.customer.id, keyHash, new Date().toISOString()).run();

  return json({
    license: {
      id, product: null, tier: null, expiresAt: null,
      source: "claim", orderId: null, licenseKeyPlain: null, syncStatus: "not_synced",
    },
  }, 201);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

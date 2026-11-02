// POST /api/app/licenses { userId, app } — VB worker goi (server-to-server) de
// lay DANH SACH license CON HOP LE cua mot tai khoan cho app, de app hien man
// chon license khi tai khoan co >= 2 license.
// Xac thuc bang X-Identity-Secret (giong app/bootstrap & identity/verify).
//
// Chi tra license con hieu luc: chua revoke, status active, chua het han
// (expiry_utc NULL = chua kich hoan -> con hop le; dem han tu lan bind dau).
// KHONG tra license_key tho (SSO khong can va khong nen lo key).
import { json, errorJson, readJson } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const userId = String(body.userId || body.user_id || "").trim();
  const app = String(body.app || "video-builder").trim();
  if (!userId) return errorJson("INVALID_USER", "Thiếu userId.", 422);

  const nowIso = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, tier, expiry_utc, validity_days, activated_at, status, organization, source, created_at
       FROM licenses
      WHERE customer_id = ?1 AND app = ?2
        AND revoked_at IS NULL
        AND status = 'active'
        AND (expiry_utc IS NULL OR expiry_utc > ?3)
      ORDER BY created_at DESC`
  ).bind(userId, app, nowIso).all();

  const licenses = (results || []).map((r) => ({
    licenseId: r.id,
    tier: r.tier,
    expiryUtc: r.expiry_utc,
    validityDays: r.validity_days,
    activatedAt: r.activated_at,
    source: r.source,
    organization: r.organization,
  }));

  await logEvent(env, {
    eventType: "app.license_list", customerId: userId, actor: "app",
    ip: clientIp(request), details: { app, count: licenses.length },
  });

  return json({ licenses });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

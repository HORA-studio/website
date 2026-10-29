// POST /api/app/bootstrap { userId, app, deviceId } — VB worker goi (server-to-server)
// de: (1) bind device vao license cua user, (2) tra plan/expiry de VB ky cho client.
// Xac thuc bang X-Identity-Secret.
//
// Quy tac (giong he license cu, viet lai o web):
// - 1 license = 1 may: neu license da bind device khac -> LICENSE_DEVICE_BOUND.
// - Chua co license -> tra needsActivation:true (client hien buoc claim/mua).
// - Lan bind dau tien -> bat dau dem han (expiry_utc = activated_at + validity_days).
// - License het han/thu hoi -> needsActivation:true + reason tuong ung.
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

// Tier -> so job dong thoi. Giu khop ban cu (VB: plus/pro cao hon go).
const MAX_CONCURRENT = { go: 2, plus: 5, pro: 10 };

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const userId = String(body.userId || body.user_id || "").trim();
  const app = String(body.app || "video-builder").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  if (!userId) return errorJson("INVALID_USER", "Thiếu userId.", 422);
  if (!deviceId) return errorJson("INVALID_DEVICE", "Thiếu deviceId.", 422);

  const noLicense = (reason) => json({
    licenseValid: false, plan: "no-license", expiry: null,
    maxConcurrentVideoJobs: 0, needsActivation: true, reason,
  }, 200);

  // Lay license active moi nhat cua user cho app nay.
  const lic = await env.DB.prepare(
    "SELECT * FROM licenses WHERE customer_id = ?1 AND app = ?2 ORDER BY created_at DESC LIMIT 1"
  ).bind(userId, app).first();
  if (!lic) return noLicense("no_license");
  if (lic.revoked_at) return noLicense("revoked");

  const now = new Date();
  // Het han?
  if (lic.expiry_utc && new Date(lic.expiry_utc).getTime() <= now.getTime()) return noLicense("expired");

  // Device binding: chi cho 1 may / license.
  const bound = await env.DB.prepare(
    "SELECT device_id FROM devices WHERE app = ?1 AND license_id = ?2 LIMIT 1"
  ).bind(app, lic.id).first();
  if (bound && bound.device_id !== deviceId) {
    return noLicense("device_bound");
  }
  if (!bound) {
    await env.DB.prepare(
      "INSERT INTO devices (app, device_id, license_id, customer_id, bound_at) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(app, deviceId, lic.id, userId, now.toISOString()).run();
    await logEvent(env, { eventType: "app.device_bind", customerId: userId, actor: "app", ip: clientIp(request), deviceId, details: { app, licenseId: lic.id } });
  }

  // Lan kich hoat dau tien -> dem han tu bay gio.
  let expiry = lic.expiry_utc;
  if (!expiry) {
    const days = Number(lic.validity_days) || 30;
    expiry = new Date(now.getTime() + days * 86400000).toISOString();
    await env.DB.prepare(
      "UPDATE licenses SET expiry_utc = ?2, activated_at = ?2 WHERE id = ?1 AND expiry_utc IS NULL"
    ).bind(lic.id, expiry).run();
  }

  const tier = lic.tier || "go";
  return json({
    licenseValid: true,
    plan: tier,
    expiry,
    maxConcurrentVideoJobs: MAX_CONCURRENT[tier] || 2,
    needsActivation: false,
    reason: null,
  }, 200);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

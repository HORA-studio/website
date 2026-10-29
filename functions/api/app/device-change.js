// POST /api/app/device-change { userId, app, deviceId, oldDeviceId } — doi may.
// Cooldown 7 ngay / license (giong he cu). Xac thuc bang X-Identity-Secret.
import { json, errorJson, readJson } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";

const COOLDOWN_MS = 7 * 24 * 3600 * 1000;

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
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  if (!userId || !deviceId) return errorJson("INVALID_REQUEST", "Thiếu userId hoặc deviceId.", 422);

  const lic = await env.DB.prepare(
    "SELECT * FROM licenses WHERE customer_id = ?1 AND app = ?2 ORDER BY created_at DESC LIMIT 1"
  ).bind(userId, app).first();
  if (!lic || lic.revoked_at) return errorJson("LICENSE_NOT_FOUND", "Không có license dùng được.", 404);

  // Cooldown.
  const last = await env.DB.prepare(
    "SELECT changed_at FROM device_changes WHERE license_id = ?1 ORDER BY changed_at DESC LIMIT 1"
  ).bind(lic.id).first();
  if (last && Date.now() - new Date(last.changed_at).getTime() < COOLDOWN_MS) {
    const retryAt = new Date(new Date(last.changed_at).getTime() + COOLDOWN_MS).toISOString();
    return errorJson("DEVICE_CHANGE_COOLDOWN", `Chỉ được đổi thiết bị 7 ngày một lần. Thử lại sau ${retryAt}.`, 429);
  }

  const now = new Date().toISOString();
  const prev = await env.DB.prepare(
    "SELECT device_id FROM devices WHERE app = ?1 AND license_id = ?2 LIMIT 1"
  ).bind(app, lic.id).first();

  await env.DB.prepare("DELETE FROM devices WHERE app = ?1 AND license_id = ?2").bind(app, lic.id).run();
  await env.DB.prepare(
    "INSERT INTO devices (app, device_id, license_id, customer_id, bound_at) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(app, deviceId, lic.id, userId, now).run();
  await env.DB.prepare(
    "INSERT INTO device_changes (id, license_id, old_device, new_device, changed_at) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(crypto.randomUUID(), lic.id, prev ? prev.device_id : null, deviceId, now).run();

  await logEvent(env, { eventType: "app.device_change", customerId: userId, actor: "app", ip: clientIp(request), deviceId, details: { app, licenseId: lic.id, oldDevice: prev ? prev.device_id : null } });
  return json({ ok: true, deviceId });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

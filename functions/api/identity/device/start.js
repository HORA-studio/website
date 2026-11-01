// POST /api/identity/device/start — app desktop xin phien ket noi (kieu GitHub).
// Cong khai (app chua co token) nen rate limit theo IP.
// Tra ve { device_code, user_code, verify_url, interval, expires_in }.
// device_code: app giu, dung de poll. user_code: hien tren web de doi chieu.
import { json, errorJson, readJson, siteUrl } from "../../_lib.js";
import { logEvent, clientIp } from "../../_log.js";
import {
  ALLOWED_APPS, DEVICE_INTERVAL, DEVICE_TTL_MS,
  randomHex32, newUserCode, rateLimitedByIp, sha256Hex,
} from "../_device.js";

const MAX_USER_CODE_TRIES = 5;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const app = String(body.app || "video-builder").trim();
  if (!ALLOWED_APPS.has(app)) return errorJson("INVALID_APP", "Ứng dụng không hợp lệ.", 422);
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);

  const ip = clientIp(request);
  if (await rateLimitedByIp(env, ip)) {
    return errorJson("RATE_LIMITED", "Quá nhiều yêu cầu, thử lại sau.", 429);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + DEVICE_TTL_MS).toISOString();

  const deviceCode = randomHex32();
  const deviceCodeHash = await sha256Hex(deviceCode);

  // user_code unique — thu vai lan phong khi trung (khong gian rat lon).
  let userCode = "";
  for (let i = 0; i < MAX_USER_CODE_TRIES; i++) {
    const candidate = newUserCode();
    const clash = await env.DB.prepare(
      "SELECT 1 FROM device_auth WHERE user_code = ?1"
    ).bind(candidate).first();
    if (!clash) { userCode = candidate; break; }
  }
  if (!userCode) return errorJson("DEVICE_START_FAILED", "Không tạo được mã kết nối, thử lại.", 500);

  await env.DB.prepare(
    `INSERT INTO device_auth
       (device_code_hash, user_code, app, device_id, ip, status, created_at, expires_at, interval_seconds)
     VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8)`
  ).bind(deviceCodeHash, userCode, app, deviceId || null, ip || null, nowIso, expiresAt, DEVICE_INTERVAL).run();

  await logEvent(env, {
    eventType: "identity.device_start", actor: "app", ip, deviceId,
    details: { app, userCode },
  });

  return json({
    device_code: deviceCode,
    user_code: userCode,
    verify_url: `${siteUrl(env)}/device?code=${encodeURIComponent(userCode)}`,
    interval: DEVICE_INTERVAL,
    expires_in: Math.floor(DEVICE_TTL_MS / 1000),
  }, 201);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

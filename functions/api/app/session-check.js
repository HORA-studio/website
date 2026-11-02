// POST /api/app/session-check { app, deviceId, appToken? } — VB worker goi
// (server-to-server, header X-Identity-Secret) de tra loi: phien dang nhap cua
// tai khoan con thuoc may nay khong.
//
// Day la LUOI AN TOAN cho co che phien doc quyen: co che chinh la chan ngay o
// device/poll; con endpoint nay de may cu tu phat hien minh khong con giu phien
// (vd user da dang xuat roi dang nhap lai o may khac) va tu da ve man dang nhap.
//
// Tra ve { actives, isCurrentDevice, deviceCount, sameDeviceCount }:
//   actives=false -> khong xac dinh duoc phien -> app KHONG bi da.
import { json, errorJson, readJson, sha256Hex } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { accountSessionStatus } from "../_session.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Doc appToken ra customer_id (cung logic voi identity/verify).
async function customerForToken(env, appToken) {
  if (!appToken) return null;
  const tokenHash = await sha256Hex(appToken);
  const row = await env.DB.prepare(
    "SELECT customer_id FROM app_tokens WHERE token_hash = ?1 AND revoked_at IS NULL"
  ).bind(tokenHash).first();
  return row ? row.customer_id : null;
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Sai hoặc thiếu X-Identity-Secret.", 401);

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const app = String(body.app || "video-builder").trim();
  const userId = String(body.userId || body.user_id || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  const appToken = String(body.appToken || body.app_token || "").trim();
  if (!deviceId) return errorJson("INVALID_DEVICE", "Thiếu deviceId.", 422);

  // Khong xac dinh duoc tai khoan -> khong da (fail-safe).
  const tokenOwner = await customerForToken(env, appToken);
  const customerId = userId || tokenOwner;
  if (!customerId) return json({ actives: false, isCurrentDevice: false, deviceCount: 0, sameDeviceCount: 0 });
  // Token va userId phai CUNG chu (tranh ket luan nham ve tai khoan khac).
  if (userId && tokenOwner && userId !== tokenOwner) {
    return json({ actives: false, isCurrentDevice: false, deviceCount: 0, sameDeviceCount: 0 });
  }

  try {
    const status = await accountSessionStatus(env, customerId, app, deviceId);
    if (status.actives && !status.isCurrentDevice) {
      await logEvent(env, {
        eventType: "app.session_taken_over",
        customerId,
        actor: "app",
        ip: clientIp(request),
        deviceId,
        details: { app },
      });
    }
    return json(status);
  } catch (err) {
    console.warn("app/session-check failed:", err && err.message ? err.message : String(err));
    return json({ actives: false, isCurrentDevice: false, deviceCount: 0, sameDeviceCount: 0 });
  }
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

// POST /api/app/session-release { userId, app, deviceId } — VB worker goi
// (server-to-server, header X-Identity-Secret) khi khach bam "Dang xuat" trong app.
//
// Nha phien doc quyen de may khac dang nhap duoc ngay (khong phai cho cooldown).
// Chi may DANG GIU phien moi nha duoc — may la khong nha ho duoc.
import { json, errorJson, readJson } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { releaseAccountSession } from "../_session.js";

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

  const app = String(body.app || "video-builder").trim();
  const userId = String(body.userId || body.user_id || "").trim();
  const deviceId = String(body.deviceId || body.device_id || "").trim().slice(0, 128);
  if (!userId) return errorJson("INVALID_USER", "Thiếu userId.", 422);
  if (!deviceId) return errorJson("INVALID_DEVICE", "Thiếu deviceId.", 422);

  const released = await releaseAccountSession(env, userId, app, deviceId);
  if (released) {
    await logEvent(env, {
      eventType: "app.session_release", customerId: userId, actor: "app",
      ip: clientIp(request), deviceId, details: { app },
    });
  }
  return json({ ok: released });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

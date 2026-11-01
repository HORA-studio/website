// POST /api/identity/device/deny { user_code } — (dang nhap) user bam "Tu choi".
// Danh dau denied de app poll thay va dung ngay.
import { json, errorJson, readJson, requireAuth } from "../../_lib.js";
import { logEvent, clientIp } from "../../_log.js";
import { expireIfStale, normalizeUserCode } from "../_device.js";

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  const userCode = normalizeUserCode(body && (body.user_code || body.userCode));
  if (!userCode) return errorJson("INVALID_CODE", "Mã kết nối không hợp lệ.", 422);

  let row = await env.DB.prepare(
    "SELECT * FROM device_auth WHERE user_code = ?1"
  ).bind(userCode).first();
  if (!row) return errorJson("DEVICE_NOT_FOUND", "Mã kết nối không tồn tại.", 404);

  row = await expireIfStale(env, row);
  if (row.status === "expired") return errorJson("DEVICE_EXPIRED", "Phiên kết nối đã hết hạn.", 410);
  if (row.status !== "pending") {
    return errorJson("DEVICE_ALREADY_HANDLED", "Phiên kết nối này đã được xử lý.", 409);
  }

  const upd = await env.DB.prepare(
    "UPDATE device_auth SET status = 'denied' WHERE user_code = ?1 AND status = 'pending'"
  ).bind(userCode).run();
  if ((upd.meta && upd.meta.changes) === 0) {
    return errorJson("DEVICE_ALREADY_HANDLED", "Phiên kết nối này đã được xử lý.", 409);
  }

  await logEvent(env, {
    eventType: "identity.device_deny", customerId: a.customer.id, actor: "web",
    ip: clientIp(request), deviceId: row.device_id || null, details: { app: row.app, userCode },
  });

  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

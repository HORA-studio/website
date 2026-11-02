// POST /api/identity/device/approve { user_code } — (dang nhap) user bam "Dong y".
// Gan customer vao phien. Token CHUA phat o day — app se lay o budoc poll
// (dam bao app thuc su nhan duoc). Atomic theo status='pending'.
import { json, errorJson, readJson, requireAuth } from "../../_lib.js";
import { logEvent, clientIp } from "../../_log.js";
import { expireIfStale, normalizeUserCode } from "../_device.js";
import { getAccountSession, cooldownRemainingSeconds, sessionEnforced } from "../../_session.js";

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

  // Chot som tren WEB cho UX: neu tai khoan dang duoc may khac giu phien thi bao
  // ngay khi user bam "Dong y", khong de ho tuong da ket noi xong. Chot bat buoc
  // (khong cap token) van nam o device/poll. Cong tac session.enforce mac dinh TAT.
  if (await sessionEnforced(env)) {
    const held = await getAccountSession(env, a.customer.id, row.app);
    if (held && held.session_device_id && held.session_device_id !== (row.device_id || "")) {
      const wait = cooldownRemainingSeconds(held);
      if (wait > 0) {
        return json({ error: {
          code: "SESSION_RETRY_TOO_SOON",
          message: `Tài khoản đang được dùng ở máy khác. Thử lại sau ${wait}s.`,
        } }, 429, { "Retry-After": String(wait) });
      }
      return errorJson("SESSION_TAKEN",
        "Tài khoản này đang được đăng nhập ở máy khác. Hãy bấm Đăng xuất ở máy đó rồi thử lại.", 409);
    }
  }

  const nowIso = new Date().toISOString();
  const upd = await env.DB.prepare(
    "UPDATE device_auth SET status = 'approved', customer_id = ?2, approved_at = ?3 WHERE user_code = ?1 AND status = 'pending'"
  ).bind(userCode, a.customer.id, nowIso).run();
  if ((upd.meta && upd.meta.changes) === 0) {
    return errorJson("DEVICE_ALREADY_HANDLED", "Phiên kết nối này đã được xử lý.", 409);
  }

  await logEvent(env, {
    eventType: "identity.device_approve", customerId: a.customer.id, actor: "web",
    ip: clientIp(request), deviceId: row.device_id || null, details: { app: row.app, userCode },
  });

  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

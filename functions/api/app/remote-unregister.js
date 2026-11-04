// POST /api/app/remote-unregister — app desktop huy dang ky Web Remote
// (khi app dong, khi tat Remote, hoac khi doi may). Cung xac thuc nhu
// remote-register: appToken hoac X-Identity-Secret + userId.
// Idempotent: khong co dang ky thi van tra { ok: true }.
import { json, errorJson, readJson } from "../_lib.js";
import { logEvent, clientIp } from "../_log.js";
import { appCaller } from "../_remote.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const caller = await appCaller(env, request, body);
  if (!caller) return errorJson("UNAUTHORIZED", "Token ứng dụng không hợp lệ hoặc đã bị thu hồi.", 401);

  try {
    await env.DB.prepare("DELETE FROM remote_registrations WHERE customer_id = ?1")
      .bind(caller.customerId).run();
  } catch (err) {
    console.warn("app/remote-unregister failed:", err && err.message ? err.message : String(err));
    return errorJson("UNREGISTER_FAILED", "Không huỷ được đăng ký Remote.", 500);
  }

  await logEvent(env, {
    eventType: "remote.unregister", customerId: caller.customerId, actor: "app",
    ip: clientIp(request), deviceId: caller.deviceId, details: {},
  });

  return json({ ok: true });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

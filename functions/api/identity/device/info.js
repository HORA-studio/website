// GET /api/identity/device/info?user_code=XXXX-XXXX — trang /device doc trang thai
// de hien man "Dong y / Tu choi". Cong khai (chua can login) — KHONG tra customer/token.
import { json, errorJson } from "../../_lib.js";
import { expireIfStale, normalizeUserCode } from "../_device.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const userCode = normalizeUserCode(url.searchParams.get("user_code"));
  if (!userCode) return errorJson("INVALID_CODE", "Mã kết nối không hợp lệ.", 422);

  let row = await env.DB.prepare(
    "SELECT user_code, app, status, expires_at FROM device_auth WHERE user_code = ?1"
  ).bind(userCode).first();
  if (!row) return errorJson("DEVICE_NOT_FOUND", "Mã kết nối không tồn tại.", 404);

  row = await expireIfStale(env, row);
  return json({
    user_code: row.user_code,
    app: row.app,
    status: row.status,
    expires_at: row.expires_at,
  });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

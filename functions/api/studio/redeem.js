// POST /api/studio/redeem — khach dan MA TOKEN (nhan duoc sau khi nap tien
// qua kenh cua chu shop) de nhan credit vao vi Studio.
// Body: { token: "XXXX-XXXX-XXXX" } -> { ok, credits, balance }.
// Token do SERVER CUA CHU SHOP phat hanh: he thong thanh toan cua shop ghi
// token vao bang studio_redeem_tokens (xem db/migrate-studio-redeem-2026-11-11.sql).
// Endpoint nay chi lam phan doi soat + cong credit: token dung + chua dung +
// chua het han -> danh dau da dung (UPDATE co guard chong dung trung) ->
// addLedger 'redeem' cong credit. Token da dung/khong co/het han -> loi ro rang.
import { json, errorJson, readJson, requireAuth } from "../_lib.js";
import { addLedger } from "./_studio.js";

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.response) return a.response;

  const body = await readJson(request);
  if (!body) return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);
  const token = String(body.token || "").trim().toUpperCase();
  if (!token || token.length > 64) return errorJson("TOKEN_INVALID", "Mã token không hợp lệ.", 422);

  const row = await env.DB.prepare(
    "SELECT * FROM studio_redeem_tokens WHERE token = ?1"
  ).bind(token).first();
  if (!row) return errorJson("TOKEN_NOT_FOUND", "Không tìm thấy mã token này.", 404);
  if (row.used_by) return errorJson("TOKEN_USED", "Mã token này đã được sử dụng.", 409);
  if (row.expires_at && row.expires_at < new Date().toISOString()) {
    return errorJson("TOKEN_EXPIRED", "Mã token đã hết hạn.", 410);
  }

  const now = new Date().toISOString();
  const up = await env.DB.prepare(
    "UPDATE studio_redeem_tokens SET used_by = ?2, used_at = ?3 WHERE token = ?1 AND used_by IS NULL"
  ).bind(token, a.customer.id, now).run();
  if (!up.meta || up.meta.changes !== 1) {
    return errorJson("TOKEN_USED", "Mã token này đã được sử dụng.", 409);
  }

  const grant = await addLedger(env, a.customer.id, row.credits, "redeem", token, "Nhận credit từ mã token nạp tiền");
  return json({ ok: true, credits: row.credits, balance: grant.balance });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ POST.", 405);
}

// POST /api/payments/sepay-webhook — SePay goi URL nay khi tai khoan ngan hang
// cua nguoi ban nhan duoc tien. Khach tra bang chuyen khoan kem MA THANH TOAN
// trong noi dung; webhook nay doi MA + SO TIEN voi don dang cho moi ghi 'paid'.
//
// Quy tac cung:
// - Chi xu ly khi header Authorization: Apikey <SEPAY_WEBHOOK_API_KEY> khop
//   (chap nhan them X-SePay-Api-Key). Sai/thieu -> 401, khong lam gi ca.
// - So tien phai BANG DUNG order.amount_vnd; lech -> ghi payments row
//   'amount_mismatch' + raw_json, KHONG ghi paid.
// - Chong trung theo gateway_trans_id (id giao dich SePay).
// - Khong tim thay don -> van tra 200 {success:true, matched:false} vi SePay
//   se retry khi nhan non-2xx — don la khong ton tai thi retry cung vo ich.
// - KHONG bao gio log API key.
import { json, readJson, tryIssueLicense } from "../_lib.js";
import { normalizePaymentText, findPaymentCodeInText } from "./_gateway.js";
import { logEvent, clientIp } from "../_log.js";

const ok = (extra = {}) => json({ success: true, ...extra }, 200);

export async function onRequestPost({ request, env }) {
  if (!env.SEPAY_WEBHOOK_API_KEY) {
    return json({ success: false, message: "Webhook chưa được cấu hình." }, 503);
  }

  const auth = (request.headers.get("Authorization") || "").trim();
  const altKey = (request.headers.get("X-SePay-Api-Key") || "").trim();
  const authOk =
    altKey === env.SEPAY_WEBHOOK_API_KEY ||
    (auth.toLowerCase().startsWith("apikey ") && auth.slice(7).trim() === env.SEPAY_WEBHOOK_API_KEY);
  if (!authOk) return json({ success: false, message: "Unauthorized" }, 401);

  const body = await readJson(request);
  if (!body) return json({ success: false, message: "Invalid JSON" }, 400);

  // Chi quan tam tien VAO tai khoan nguoi ban.
  if (body.transferType && String(body.transferType) !== "in") {
    return ok({ ignored: true });
  }

  const transId = body.id !== undefined && body.id !== null ? String(body.id) : "";

  // Chong xu ly trung: id giao dich nay da duoc ghi nhan (paid hoac mismatch).
  if (transId) {
    const dup = await env.DB.prepare(
      "SELECT id FROM payments WHERE gateway = 'sepay' AND gateway_trans_id = ?1 AND status IN ('paid', 'amount_mismatch')"
    ).bind(transId).first();
    if (dup) return ok({ duplicate: true });
  }

  // Danh sach phien thanh toan SePay dang cho (status 'initiated').
  const { results: pending } = await env.DB.prepare(
    "SELECT * FROM payments WHERE gateway = 'sepay' AND status = 'initiated'"
  ).all();
  const rows = pending || [];
  if (!rows.length) return ok({ matched: false });

  // Uu tien body.code neu khop 1 ma dang cho; khong thi quet noi dung/mo ta.
  let payRow = null;
  if (body.code) {
    const want = normalizePaymentText(body.code);
    payRow = rows.find((r) => normalizePaymentText(r.gateway_order_id) === want) || null;
  }
  if (!payRow) {
    const haystack = `${body.content || ""} ${body.description || ""}`;
    const found = findPaymentCodeInText(haystack, rows.map((r) => r.gateway_order_id));
    if (found) payRow = rows.find((r) => r.gateway_order_id === found) || null;
  }
  if (!payRow) return ok({ matched: false });

  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(payRow.order_id).first();
  if (!order) return ok({ matched: false });

  const now = new Date().toISOString();
  const raw = JSON.stringify(body);
  const amount = Number(body.transferAmount);

  // So tien phai bang dung — lech thi ghi nhan rieng, giu phien 'initiated'
  // de mot giao dich dung sau do van doi khop duoc.
  if (!Number.isFinite(amount) || amount !== Number(order.amount_vnd)) {
    await env.DB.prepare(
      "INSERT INTO payments (id, order_id, gateway, gateway_order_id, gateway_trans_id, amount_vnd, status, raw_json, created_at) VALUES (?1, ?2, 'sepay', ?3, ?4, ?5, 'amount_mismatch', ?6, ?7)"
    ).bind(crypto.randomUUID(), order.id, payRow.gateway_order_id, transId || null, Number.isFinite(amount) ? Math.round(amount) : 0, raw, now).run();
    return ok({ matched: false, reason: "amount_mismatch" });
  }

  // Thanh cong: cap nhat phien thanh toan + don, roi thu cap license ngay
  // trong DB web (tryIssueLicense idempotent theo order_id). Cap THAT BAI
  // sau khi da ghi nhan tien -> don ve 'paid_pending_issue' de endpoint
  // retry noi bo cap lai sau; van tra success cho SePay (tien da ghi nhan
  // dung) — khong de webhook vang 500 roi SePay retry trung vao guard
  // giao dich (duplicate) khien don ket khong license.
  await env.DB.prepare("UPDATE payments SET status = 'paid', gateway_trans_id = ?2, raw_json = ?3 WHERE id = ?1")
    .bind(payRow.id, transId || null, raw).run();
  await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?2 WHERE id = ?1").bind(order.id, now).run();
  const cust = await env.DB.prepare("SELECT email FROM customers WHERE id = ?1").bind(order.customer_id).first();
  try {
    await tryIssueLicense(env, { ...order, email: cust ? cust.email : null });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'paid_pending_issue' WHERE id = ?1").bind(order.id).run();
    await logEvent(env, { eventType: "license.issue_failed", customerId: order.customer_id, actor: "sepay", ip: clientIp(request), details: { orderId: order.id, error: String((e && e.message) || e) } });
  }
  await logEvent(env, { eventType: "payment.paid", customerId: order.customer_id, actor: "sepay", ip: clientIp(request), details: { orderId: order.id, amount, transId } });

  return ok({});
}

export function onRequest() {
  return json({ success: false, message: "Method not allowed" }, 405);
}

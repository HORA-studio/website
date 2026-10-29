// GET /api/payments/vnpay-ipn?... — VNPay goi URL nay (server-to-server).
// Quy tac cung: XAC MINH CHECKSUM + DOI CHIEU SO TIEN moi ghi 'paid'.
// Dap an theo dung spec VNPay: {RspCode, Message} — '00' thanh cong,
// '97' sai checksum, '01' khong thay don, '04' sai so tien, '02' don da xac nhan.
import { json, tryIssueLicense } from "../_lib.js";
import { isVnpayConfigured, verifyVnpayChecksum } from "./_gateway.js";

const rsp = (code, message) => json({ RspCode: code, Message: message }, 200);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  if (!isVnpayConfigured(env)) return rsp("99", "Gateway not configured");

  const ok = await verifyVnpayChecksum(env, params);
  if (!ok) return rsp("97", "Invalid checksum");

  // Tim don: truoc tien qua payments.gateway_order_id (= vnp_TxnRef),
  // du phong: order id bo dau '-' chinh la TxnRef da gui di.
  let order = null;
  const payByRef = await env.DB.prepare(
    "SELECT order_id FROM payments WHERE gateway = 'vnpay' AND gateway_order_id = ?1 ORDER BY created_at DESC"
  ).bind(params.vnp_TxnRef || "").first();
  if (payByRef) {
    order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?1").bind(payByRef.order_id).first();
  }
  if (!order) {
    order = await env.DB.prepare("SELECT * FROM orders WHERE REPLACE(id, '-', '') = ?1").bind(params.vnp_TxnRef || "").first();
  }
  if (!order) return rsp("01", "Order not found");

  const amount = Math.round(Number(params.vnp_Amount || 0) / 100);
  if (amount !== Number(order.amount_vnd)) return rsp("04", "Invalid amount");

  if (order.status === "paid" || order.status === "paid_pending_issue") {
    return rsp("02", "Order already confirmed");
  }

  const now = new Date().toISOString();
  const success = params.vnp_ResponseCode === "00" && (params.vnp_TransactionStatus === undefined || params.vnp_TransactionStatus === "00");

  const payRow = await env.DB.prepare(
    "SELECT id FROM payments WHERE order_id = ?1 AND gateway = 'vnpay' ORDER BY created_at DESC"
  ).bind(order.id).first();
  const raw = JSON.stringify(params);
  if (payRow) {
    await env.DB.prepare("UPDATE payments SET status = ?2, gateway_trans_id = ?3, raw_json = ?4 WHERE id = ?1")
      .bind(payRow.id, success ? "paid" : "failed", String(params.vnp_TransactionNo || ""), raw).run();
  } else {
    await env.DB.prepare(
      "INSERT INTO payments (id, order_id, gateway, gateway_order_id, gateway_trans_id, amount_vnd, status, raw_json, created_at) VALUES (?1, ?2, 'vnpay', ?3, ?4, ?5, ?6, ?7, ?8)"
    ).bind(crypto.randomUUID(), order.id, String(params.vnp_TxnRef || ""), String(params.vnp_TransactionNo || ""), order.amount_vnd, success ? "paid" : "failed", raw, now).run();
  }

  if (!success) {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ?1").bind(order.id).run();
    return rsp("00", "Success"); // da ghi nhan ket qua (that bai) — van xac nhan voi VNPay
  }

  await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?2 WHERE id = ?1").bind(order.id, now).run();
  const cust = await env.DB.prepare("SELECT email FROM customers WHERE id = ?1").bind(order.customer_id).first();
  await tryIssueLicense(env, { ...order, email: cust ? cust.email : null });

  return rsp("00", "Success");
}

export function onRequest() {
  return rsp("99", "Method not allowed");
}

// Thong bao mua hang thanh cong — dung chung cho webhook/IPN cua ca 3 cong
// (SePay, MoMo, VNPay). Chi gui AFTER don da duoc cap license thanh cong;
// KHONG kem license key trong email (key chi hien o dashboard).
// Moi loi o day deu bi nuot — khong duoc lam vo webhook da ghi nhan tien.
import { getPlans, siteUrl } from "../_lib.js";
import { sendPurchaseSuccessEmail } from "../_mail.js";
import { logEvent } from "../_log.js";

const PERIOD_VI = { month: "1 tháng", year: "1 năm" };

/**
 * Gui mail xac nhan thanh toan cho 1 don da 'paid'.
 * @returns {Promise<{sent:boolean, reason?:string}>}
 */
export async function notifyPurchaseSuccess(env, order) {
  try {
    if (!order || !order.email) return { sent: false, reason: "NO_EMAIL" };
    const plans = getPlans(env);
    const planName = (plans[order.plan] && plans[order.plan].name) || order.plan;
    const periodLabel = PERIOD_VI[order.period] || order.period;
    const accountUrl = `${siteUrl(env)}/account.html`;
    const result = await sendPurchaseSuccessEmail(env, {
      to: order.email,
      customerId: order.customer_id,
      planName,
      periodLabel,
      amountVnd: order.amount_vnd,
      accountUrl,
    });
    await logEvent(env, {
      eventType: "mail.purchase_success",
      customerId: order.customer_id,
      details: { orderId: order.id, sent: result.sent, reason: result.reason || null },
    });
    return result;
  } catch (err) {
    console.warn("notifyPurchaseSuccess failed:", err && err.message ? err.message : String(err));
    return { sent: false, reason: "ERROR" };
  }
}

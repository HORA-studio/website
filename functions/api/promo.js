// GET /api/promo — du lieu khuyen mai cho frontend:
//   promos: danh sach dot DANG CHAY (trang chu chay banner tuan tu theo list nay)
//   trial / purchaseBonusPercent: quyen loi dang hieu luc (de khoi mua hang
//   chon dung banner theo "type" cua dot)
//   you (khi co session): trang thai ca nhan cua khach.
import { json, errorJson, getSessionCustomer } from "./_lib.js";
import {
  getPromotions, activePromotions, publicPromo,
  resolveTrialBenefit, resolveBonusBenefit, isRegisteredInWindow,
} from "./_promo.js";

export async function onRequestGet({ request, env }) {
  const list = await getPromotions(env);
  const nowMs = Date.now();
  const actives = activePromotions(list, nowMs);
  const trial = resolveTrialBenefit(list, nowMs);
  const bonus = resolveBonusBenefit(list, nowMs);

  const out = {
    active: actives.length > 0,
    promos: actives.map(publicPromo),
    trial: trial ? { promoId: trial.promo.id, tier: trial.tier, days: trial.days } : null,
    purchaseBonusPercent: bonus ? bonus.percent : 0,
    bonusPromoId: bonus ? bonus.promo.id : null,
  };

  let customer = null;
  try {
    customer = await getSessionCustomer(env, request);
  } catch {
    customer = null;
  }
  if (customer) {
    const createdIso = customer.createdAt || customer.created_at;
    let hasTrial = false;
    try {
      const t = await env.DB.prepare(
        "SELECT id FROM licenses WHERE customer_id = ?1 AND organization = 'promo' LIMIT 1"
      )
        .bind(customer.id)
        .first();
      hasTrial = !!t;
    } catch {
      hasTrial = false;
    }
    const bonusEligible = !!(bonus && isRegisteredInWindow(bonus.promo, createdIso));
    out.you = {
      bonusEligible,
      trialEligible: !!(trial && isRegisteredInWindow(trial.promo, createdIso)),
      hasTrial,
      eligible: bonusEligible, // tuong thich voi frontend ban truoc
    };
  }
  return json(out);
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET.", 405);
}

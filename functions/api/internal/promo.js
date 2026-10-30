// GET/POST /api/internal/promo — endpoint NOI BO xem/ghi DANH SACH khuyen mai
// (bang meta, key 'promotions'), xac thuc bang header X-Identity-Secret nhu
// /api/internal/retry-issue. KHONG danh cho khach.
//
// GET  -> { promotions: [...] } danh sach dang hieu luc (da chuan hoa).
// POST chap nhan 1 trong 3 dang:
//   - { promotions: [ {...}, {...} ] }
//   - [ {...}, {...} ]
//   - { ... } mot dot don (se duoc boc vao mang)
// Moi dot: { id?, enabled, type: bundle|trial|purchase_bonus|announcement,
//   name, headline, link, startsAt, endsAt, trialTier, trialDays,
//   countFrom: registration|activation, purchaseBonusPercent }.
// Validate: type hop le, startsAt < endsAt (ISO), trialDays 1..90,
//   countFrom hop le, purchaseBonusPercent 0..200, trialTier go|plus.
import { json, errorJson, readJson } from "../_lib.js";
import { getPromotions, normalizePromotions, PROMO_TYPES, PROMO_COUNT_FROM, HAS_TRIAL, HAS_BONUS, PROMOS_META_KEY } from "../_promo.js";

function secretOk(request, env) {
  const expected = env.IDENTITY_INTERNAL_SECRET;
  if (!expected) return false;
  const got = (request.headers.get("X-Identity-Secret") || "").trim();
  if (!got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Thiếu hoặc sai X-Identity-Secret.", 401);
  return json({ promotions: await getPromotions(env) });
}

export async function onRequestPost({ request, env }) {
  if (!secretOk(request, env)) return errorJson("UNAUTHORIZED", "Thiếu hoặc sai X-Identity-Secret.", 401);
  const body = await readJson(request);
  if (!body || typeof body !== "object") return errorJson("BAD_JSON", "Dữ liệu gửi lên không hợp lệ.", 400);

  const rawList = Array.isArray(body) ? body : Array.isArray(body.promotions) ? body.promotions : [body];
  if (!rawList.length) return errorJson("INVALID_CONFIG", "Danh sách khuyến mãi rỗng.", 422);
  const list = normalizePromotions(rawList);

  // Validate THEO TUNG DOT va theo TYPE: chi kiem tra field ma type do thuc su
  // dung (announcement khong can trialDays/purchaseBonusPercent).
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const src = rawList[i] && typeof rawList[i] === "object" ? rawList[i] : {};
    const where = `đợt ${p.id}`;
    if (!PROMO_TYPES.includes(src.type))
      return errorJson("INVALID_CONFIG", `type không hợp lệ ở ${where} (chỉ nhận ${PROMO_TYPES.join("|")}).`, 422);
    const s = Date.parse(p.startsAt);
    const e = Date.parse(p.endsAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e)
      return errorJson("INVALID_CONFIG", `startsAt/endsAt không hợp lệ ở ${where}.`, 422);
    if (HAS_TRIAL(p.type)) {
      if (!Number.isInteger(src.trialDays) || src.trialDays < 1 || src.trialDays > 90)
        return errorJson("INVALID_CONFIG", `trialDays phải là số nguyên 1..90 ở ${where}.`, 422);
      if (!PROMO_COUNT_FROM.includes(src.countFrom))
        return errorJson("INVALID_CONFIG", `countFrom không hợp lệ ở ${where} (chỉ nhận ${PROMO_COUNT_FROM.join("|")}).`, 422);
    }
    if (HAS_BONUS(p.type)) {
      if (!(src.purchaseBonusPercent >= 0 && src.purchaseBonusPercent <= 200))
        return errorJson("INVALID_CONFIG", `purchaseBonusPercent phải trong 0..200 ở ${where}.`, 422);
    }
  }

  await env.DB.prepare(
    "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(PROMOS_META_KEY, JSON.stringify(list))
    .run();
  return json({ ok: true, promotions: list });
}

export function onRequest() {
  return errorJson("METHOD_NOT_ALLOWED", "Chỉ hỗ trợ GET/POST.", 405);
}

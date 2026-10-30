// ============================================================================
// KHUYEN MAI — cau hinh doc tu bang meta (key 'promotion', JSON) trong D1.
// Sua cau hinh KHONG can deploy lai code:
//   - POST /api/internal/promo (header X-Identity-Secret) de ghi cau hinh moi
//   - GET  /api/internal/promo (cung secret) de xem cau hinh dang dung
//   - hoac sua truc tiep dong meta nay trong D1 console.
// Thieu dong meta / JSON hong -> dung DEFAULT_PROMOTION ben duoi (fail-soft:
// loi doc cau hinh khong bao gio duoc lam hong dang ky / cap license).
//
// LUAT AP DUNG (mot cua so thoi gian duy nhat [startsAt, endsAt)):
//   - Tai khoan dang ky TRONG cua so -> duoc ca 2 quyen loi.
//   - Dung thu: cap ngay khi dang ky (license Plus, dem han tu luc kich hoat
//     nhu moi license khac).
//   - Mua goi +bonus%: chi khi mua TRONG cua so (va tai khoan dang ky trong
//     cua so). Tang ngay cong vao validity_days cua license khi cap.
// ============================================================================

export const PROMO_META_KEY = "promotion";

export const DEFAULT_PROMOTION = {
  enabled: true,
  name: "Ưu đãi tháng 11",
  // Thang 11 chi co 30 ngay: cua so [01/11 00:00, 01/12 00:00) gio VN.
  startsAt: "2026-11-01T00:00:00+07:00",
  endsAt: "2026-12-01T00:00:00+07:00",
  trialTier: "plus",
  trialDays: 7,
  purchaseBonusPercent: 50,
  headline:
    "Tháng 11: đăng ký tài khoản mới được dùng thử Plus miễn phí 7 ngày + mua gói Go/Plus tặng thêm 50% thời gian sử dụng",
};

export async function getPromotion(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?1")
      .bind(PROMO_META_KEY)
      .first();
    if (row && row.value) {
      const cfg = JSON.parse(row.value);
      if (cfg && typeof cfg === "object") return { ...DEFAULT_PROMOTION, ...cfg };
    }
  } catch {
    // DB chua co bang meta / JSON hong -> dung mac dinh.
  }
  return { ...DEFAULT_PROMOTION };
}

export function promoStartsMs(cfg) {
  return Date.parse(cfg.startsAt);
}

export function promoEndsMs(cfg) {
  return Date.parse(cfg.endsAt);
}

// Dang trong thoi gian khuyen mai hay khong (tai thoi diem nowMs).
export function isPromoActive(cfg, nowMs) {
  if (!cfg.enabled) return false;
  const s = promoStartsMs(cfg);
  const e = promoEndsMs(cfg);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return nowMs >= s && nowMs < e;
}

// Khach co thuoc doi tuong khuyen mai khong: dang ky trong cua so VA
// thoi diem xet (nowMs) cung trong cua so.
export function isCustomerEligible(cfg, customerCreatedAtIso, nowMs) {
  if (!isPromoActive(cfg, nowMs)) return false;
  const created = Date.parse(customerCreatedAtIso || "");
  if (!Number.isFinite(created)) return false;
  return created >= promoStartsMs(cfg) && created < promoEndsMs(cfg);
}

// So ngay duoc cong them cho mot goi co baseDays ngay (lam tron).
export function promoBonusDays(baseDays, cfg) {
  const pct = Number(cfg.purchaseBonusPercent) || 0;
  if (pct <= 0) return 0;
  return Math.round((baseDays * pct) / 100);
}

// Ban rut gon cho frontend (khong lo chi tiet noi bo).
export function publicPromotion(cfg, nowMs) {
  return {
    active: isPromoActive(cfg, nowMs),
    name: cfg.name,
    headline: cfg.headline,
    startsAt: cfg.startsAt,
    endsAt: cfg.endsAt,
    trialTier: cfg.trialTier,
    trialDays: cfg.trialDays,
    purchaseBonusPercent: cfg.purchaseBonusPercent,
  };
}

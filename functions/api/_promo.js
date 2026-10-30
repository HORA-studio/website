// ============================================================================
// KHUYEN MAI — danh sach cac dot khuyen mai, doc tu bang meta trong D1:
//   key 'promotions' = JSON mang cac dot (moi dot mot object, xem duoi).
//   key 'promotion'  = dang cu (1 dot don) — van doc duoc de tuong thich.
// Sua cau hinh KHONG can deploy lai code: POST /api/internal/promo
// (header X-Identity-Secret) hoac sua truc tiep trong D1 console.
// Loi doc/parse cau hinh -> dung DEFAULT_PROMOTIONS (fail-soft).
//
// MOI DOT CO MOT "type" quyet dinh quyen loi + cach hien banner:
//   - 'bundle'         : ca dung thu khi dang ky LAN + % thoi gian khi mua.
//   - 'trial'          : chi dung thu khi dang ky.
//   - 'purchase_bonus' : chi + % thoi gian khi mua.
//   - 'announcement'   : chi thong bao (chay o banner trang chu), khong quyen loi.
//
// LUAT QUYEN LOI (theo tung dot):
//   - Dung thu: dang ky TRONG cua so cua dot co trial -> cap ngay luc dang ky
//     (moi tai khoan 1 lan / 1 dot, danh dau qua notes 'promo:<id>').
//     'countFrom' quyet dinh MOC BAT DAU DEM HAN cua license thu:
//       - 'registration' (mac dinh): dem tu LUC TAO TAI KHOAN (expiry_utc duoc
//         chot ngay khi dang ky) — khach phai kich hoat truoc khi het han.
//       - 'activation': dem tu luc bind device dau tien (expiry_utc = NULL).
//   - + % mua goi: tai khoan dang ky trong cua so cua dot co bonus VA mua
//     trong cua so -> cong % vao validity_days luc cap license. Ap dung cho
//     MOI goi (go/plus/thang/nam) — khong gioi han goi.
// ============================================================================

export const PROMOS_META_KEY = "promotions";
export const PROMO_META_KEY = "promotion"; // legacy

export const PROMO_TYPES = ["bundle", "trial", "purchase_bonus", "announcement"];

// Moc bat dau dem han cua license dung thu.
export const PROMO_COUNT_FROM = ["registration", "activation"];

const BASE_PROMO = {
  id: "promo",
  enabled: true,
  type: "bundle",
  name: "Khuyến mãi",
  headline: "",
  link: "",
  startsAt: "2026-11-01T00:00:00+07:00",
  endsAt: "2026-12-01T00:00:00+07:00",
  trialTier: "plus",
  trialDays: 7,
  countFrom: "registration",
  purchaseBonusPercent: 50,
};

export const DEFAULT_PROMOTIONS = [
  {
    ...BASE_PROMO,
    id: "thang-11-2026",
    name: "Ưu đãi tháng 11",
    headline:
      "Tháng 11: đăng ký tài khoản mới được dùng thử Plus miễn phí 7 ngày (hạn đếm từ lúc tạo tài khoản) + mua bất cứ gói nào tặng thêm 50% thời gian sử dụng",
    link: "/account.html?mode=register",
    // Thang 11 chi co 30 ngay: cua so [01/11 00:00, 01/12 00:00) gio VN.
    startsAt: "2026-11-01T00:00:00+07:00",
    endsAt: "2026-12-01T00:00:00+07:00",
    countFrom: "registration",
  },
  // Thong bao ra mat ban dung thu 0.1.0 — chay o ticker trang chu, khong
  // quyen loi (type 'announcement'). Cung cua so voi dot KM thang 11.
  {
    id: "release-0-1-0",
    type: "announcement",
    name: "Bản dùng thử 0.1.0",
    headline:
      "Ra mắt bản dùng thử 0.1.0: quản lý tài khoản, tạo video và ảnh số lượng lớn đa luồng",
    link: "/index.html#workflow",
    startsAt: "2026-11-01T00:00:00+07:00",
    endsAt: "2026-12-01T00:00:00+07:00",
  },
];

function normalizePromo(raw, idx) {
  const p = { ...BASE_PROMO, ...(raw && typeof raw === "object" ? raw : {}) };
  p.id = String(p.id || `promo-${idx + 1}`).slice(0, 64);
  if (!PROMO_TYPES.includes(p.type)) p.type = "announcement";
  p.enabled = p.enabled !== false;
  p.trialDays = Number.isInteger(p.trialDays) ? p.trialDays : 7;
  p.purchaseBonusPercent = Number(p.purchaseBonusPercent) || 0;
  if (!["go", "plus"].includes(p.trialTier)) p.trialTier = "plus";
  if (!PROMO_COUNT_FROM.includes(p.countFrom)) p.countFrom = "registration";
  return p;
}

export async function getPromotions(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?1")
      .bind(PROMOS_META_KEY)
      .first();
    if (row && row.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr) && arr.length) return arr.map(normalizePromo);
    }
  } catch { /* qua fallback */ }
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = ?1")
      .bind(PROMO_META_KEY)
      .first();
    if (row && row.value) {
      const one = JSON.parse(row.value);
      if (one && typeof one === "object") return [normalizePromo({ id: "default", ...one }, 0)];
    }
  } catch { /* qua mac dinh */ }
  return DEFAULT_PROMOTIONS.map(normalizePromo);
}

// ---- Tuong thich nguoc: mot so noi cu doc 1 cau hinh don ----
export async function getPromotion(env) {
  const list = await getPromotions(env);
  return list[0] || { ...BASE_PROMO };
}

export function promoWindow(promo) {
  return { s: Date.parse(promo.startsAt), e: Date.parse(promo.endsAt) };
}

export function isPromoActive(promo, nowMs) {
  if (!promo || !promo.enabled) return false;
  const { s, e } = promoWindow(promo);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return nowMs >= s && nowMs < e;
}

export function activePromotions(list, nowMs) {
  return (list || []).filter((p) => isPromoActive(p, nowMs));
}

// Dot dang cho quyen loi "dung thu khi dang ky" (dang chay, co trial).
export function resolveTrialBenefit(list, nowMs) {
  const p = activePromotions(list, nowMs).find(
    (x) => (x.type === "bundle" || x.type === "trial") && x.trialDays > 0
  );
  return p ? { promo: p, tier: p.trialTier, days: p.trialDays } : null;
}

// Tinh moc dem han cho license dung thu theo 'countFrom' cua dot:
//   - 'registration': chot han ngay (expiry = at + days, activated_at = at).
//   - 'activation'  : de NULL, dem tu luc bind device dau tien.
// Tra ve { expiry, activatedAt } (ISO hoac null) de ghi vao licenses.
export function trialWindow(promo, atMs = Date.now()) {
  const fromRegistration = !promo || promo.countFrom !== "activation";
  if (!fromRegistration) return { expiry: null, activatedAt: null };
  const at = new Date(atMs);
  const days = Number(promo.trialDays) || 0;
  return {
    expiry: new Date(at.getTime() + days * 86400000).toISOString(),
    activatedAt: at.toISOString(),
  };
}

// Dot dang cho quyen loi "+ % thoi gian khi mua" (dang chay, % > 0).
export function resolveBonusBenefit(list, nowMs) {
  const p = activePromotions(list, nowMs).find(
    (x) => (x.type === "bundle" || x.type === "purchase_bonus") && x.purchaseBonusPercent > 0
  );
  return p ? { promo: p, percent: p.purchaseBonusPercent } : null;
}

// Khach dang ky co nam trong cua so cua dot nay khong.
export function isRegisteredInWindow(promo, customerCreatedAtIso) {
  const created = Date.parse(customerCreatedAtIso || "");
  if (!Number.isFinite(created)) return false;
  const { s, e } = promoWindow(promo);
  return created >= s && created < e;
}

// Giu lai ten cu cho code da dung (kiem tra theo 1 dot + thoi diem).
export function isCustomerEligible(promo, customerCreatedAtIso, nowMs) {
  return isPromoActive(promo, nowMs) && isRegisteredInWindow(promo, customerCreatedAtIso);
}

export function promoBonusDays(baseDays, percent) {
  const pct = Number(percent) || 0;
  if (pct <= 0) return 0;
  return Math.round((baseDays * pct) / 100);
}

// Ban rut gon 1 dot cho frontend.
export function publicPromo(promo) {
  return {
    id: promo.id,
    type: promo.type,
    name: promo.name,
    headline: promo.headline,
    link: promo.link || "",
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    trialTier: promo.trialTier,
    trialDays: promo.trialDays,
    countFrom: promo.countFrom,
    purchaseBonusPercent: promo.purchaseBonusPercent,
  };
}

// Chuan hoa danh sach dot (dung boi internal endpoint khi ghi cau hinh).
export function normalizePromotions(arr) {
  return (Array.isArray(arr) ? arr : []).map(normalizePromo);
}

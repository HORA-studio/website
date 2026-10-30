// ============================================================================
// VIDEO MAU (Demo) — danh sach video o muc "Thu vien y tuong" trang chu.
// Du lieu THAT nam trong D1 (bang demo_videos, xem db/schema.sql +
// db/migrate-demo-videos-2026-10-30.sql) de doi video KHONG can sua code /
// deploy lai:
//   - Khach xem:  GET /api/demos               (chi video dang bat)
//   - Quan tri:   GET/POST/DELETE /api/internal/demos (X-Identity-Secret)
//   hoac sua truc tiep bang demo_videos trong D1 console.
// Loi doc DB / bang chua migrate / bang rong -> dung DEFAULT_DEMOS (fail-soft,
// trang chu khong bao gio trong phan demo).
//
// Moi video: { id, title, type (nhom phan loai), desc, videoUrl, image,
//   sortOrder, enabled }
//   - videoUrl: link MP4/WebM truc tiep, hoac link YouTube/Vimeo (frontend tu
//     nhung iframe). De trong = chua co video, the van hien anh + tieu de va
//     cua so xem bao "dang cap nhat".
//   - image: anh poster/thumbnail cua the (va lam poster khi phat video).
// ============================================================================

export const DEFAULT_DEMOS = [
  {
    id: "my-pham-cao-cap",
    title: "Mỹ phẩm cao cấp",
    type: "Beauty / Skincare",
    desc: "Phong cách quảng cáo tinh tế",
    videoUrl: "",
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85",
    sortOrder: 1,
    enabled: true,
  },
  {
    id: "do-gia-dung",
    title: "Đồ gia dụng",
    type: "Home & Living",
    desc: "Sản phẩm trong không gian sống",
    videoUrl: "",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=85",
    sortOrder: 2,
    enabled: true,
  },
  {
    id: "thoi-trang-toi-gian",
    title: "Thời trang tối giản",
    type: "Fashion",
    desc: "Nhấn vào chất liệu và kiểu dáng",
    videoUrl: "",
    image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85",
    sortOrder: 3,
    enabled: true,
  },
  {
    id: "nuoc-hoa-lam-dep",
    title: "Nước hoa & làm đẹp",
    type: "Beauty / Lifestyle",
    desc: "Mood hình ảnh sang trọng",
    videoUrl: "",
    image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=85",
    sortOrder: 4,
    enabled: true,
  },
];

export function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\/[^\s<>"]+$/i.test(s.trim());
}

// Chuan hoa 1 dong video (tu request ghi cau hinh hoac tu DB).
export function normalizeDemo(raw, idx = 0) {
  const src = raw && typeof raw === "object" ? raw : {};
  const title = String(src.title || "").trim().slice(0, 200);
  const slug =
    String(src.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    `demo-${idx + 1}`;
  const videoUrl = String(src.videoUrl ?? src.video_url ?? "").trim().slice(0, 1000);
  const image = String(src.image ?? src.poster_url ?? "").trim().slice(0, 1000);
  return {
    id: slug,
    title,
    type: String(src.type ?? src.category ?? "").trim().slice(0, 120),
    desc: String(src.desc ?? src.description ?? "").trim().slice(0, 500),
    videoUrl,
    image,
    sortOrder: Number.isInteger(src.sortOrder)
      ? src.sortOrder
      : Number.isInteger(src.sort_order)
        ? src.sort_order
        : idx + 1,
    enabled: src.enabled === undefined ? true : !!src.enabled && src.enabled !== 0,
  };
}

export function normalizeDemos(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((d, i) => normalizeDemo(d, i))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function rowToDemo(r, idx) {
  return normalizeDemo(
    {
      id: r.id,
      title: r.title,
      type: r.category,
      desc: r.description,
      videoUrl: r.video_url,
      image: r.poster_url,
      sortOrder: r.sort_order,
      enabled: r.enabled === 1 || r.enabled === true,
    },
    idx
  );
}

// Doc danh sach video tu DB. includeDisabled=true -> lay ca video dang tat
// (cho endpoint quan tri). Bang chua co / rong / loi -> DEFAULT_DEMOS.
export async function getDemoVideos(env, { includeDisabled = false } = {}) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, category, description, video_url, poster_url, sort_order, enabled " +
        "FROM demo_videos ORDER BY sort_order ASC, created_at ASC"
    ).all();
    if (results && results.length) {
      const list = results.map(rowToDemo);
      // Co dong trong DB thi ton trong DB tuyet doi (ke ca khi tat het:
      // quan tri chu dong an thi trang chu khong tu hien lai mac dinh).
      return includeDisabled ? list : list.filter((d) => d.enabled);
    }
    // Bang chua migrate xong nhung rong: quan tri thay rong that, khach xem
    // fail-soft ve mac dinh.
    return includeDisabled ? [] : DEFAULT_DEMOS.map((d, i) => normalizeDemo(d, i));
  } catch {
    return includeDisabled ? [] : DEFAULT_DEMOS.map((d, i) => normalizeDemo(d, i));
  }
}

// Ban rut gon cho frontend trang chu (dung ten field ma index.html dang dung).
export function publicDemo(d) {
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    desc: d.desc,
    videoUrl: d.videoUrl,
    image: d.image,
  };
}

// Ghi TOAN BO danh sach vao DB (thay the): xoa dong cu, chen dong moi.
// Danh sach rong -> xoa het (frontend se fail-soft ve DEFAULT_DEMOS khi xem).
export async function replaceDemoVideos(env, list) {
  const now = new Date().toISOString();
  const stmts = [env.DB.prepare("DELETE FROM demo_videos")];
  for (const d of list) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO demo_videos (id, title, category, description, video_url, poster_url, sort_order, enabled, created_at, updated_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)"
      ).bind(
        d.id,
        d.title,
        d.type || null,
        d.desc || null,
        d.videoUrl || "",
        d.image || null,
        d.sortOrder,
        d.enabled ? 1 : 0,
        now
      )
    );
  }
  await env.DB.batch(stmts);
}

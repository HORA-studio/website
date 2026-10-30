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
    videoUrl: "https://videos.pexels.com/video-files/9697928/9697928-hd_1920_1080_25fps.mp4",
    image: "https://images.pexels.com/videos/9697928/pexels-photo-9697928.jpeg?auto=compress&w=900",
    sortOrder: 1,
    enabled: true,
  },
  {
    id: "do-gia-dung",
    title: "Đồ gia dụng",
    type: "Home & Living",
    desc: "Sản phẩm trong không gian sống",
    videoUrl: "https://videos.pexels.com/video-files/7578540/7578540-hd_1920_1080_30fps.mp4",
    image: "https://images.pexels.com/videos/7578540/apartment-at-home-business-buy-7578540.jpeg?auto=compress&w=900",
    sortOrder: 2,
    enabled: true,
  },
  {
    id: "thoi-trang-toi-gian",
    title: "Thời trang tối giản",
    type: "Fashion",
    desc: "Nhấn vào chất liệu và kiểu dáng",
    videoUrl: "https://videos.pexels.com/video-files/8328501/8328501-hd_1920_1080_25fps.mp4",
    image: "https://images.pexels.com/videos/8328501/pexels-photo-8328501.jpeg?auto=compress&w=900",
    sortOrder: 3,
    enabled: true,
  },
  {
    id: "nuoc-hoa-lam-dep",
    title: "Nước hoa & làm đẹp",
    type: "Beauty / Lifestyle",
    desc: "Mood hình ảnh sang trọng",
    videoUrl: "https://videos.pexels.com/video-files/6802240/6802240-hd_1920_1080_30fps.mp4",
    image: "https://images.pexels.com/videos/6802240/4k-4k-video-aromatherapy-background-6802240.jpeg?auto=compress&w=900",
    sortOrder: 4,
    enabled: true,
  },
  {
    id: "my-pham-doc",
    title: "Mỹ phẩm — dọc 9:16",
    type: "Beauty / Skincare",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://videos.pexels.com/video-files/6951174/6951174-hd_1080_1920_24fps.mp4",
    image: "https://images.pexels.com/videos/6951174/pexels-photo-6951174.jpeg?auto=compress&w=900",
    sortOrder: 5,
    enabled: true,
  },
  {
    id: "do-gia-dung-doc",
    title: "Café tại nhà — dọc 9:16",
    type: "Home & Living",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://videos.pexels.com/video-files/3753718/3753718-hd_1080_1920_25fps.mp4",
    image: "https://images.pexels.com/videos/3753718/pexels-photo-3753718.jpeg?auto=compress&w=900",
    sortOrder: 6,
    enabled: true,
  },
  {
    id: "thoi-trang-doc",
    title: "Thời trang — dọc 9:16",
    type: "Fashion",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://videos.pexels.com/video-files/16093155/16093155-hd_1080_1920_30fps.mp4",
    image: "https://images.pexels.com/videos/16093155/beautiful-beauty-clothing-dress-16093155.jpeg?auto=compress&w=900",
    sortOrder: 7,
    enabled: true,
  },
  {
    id: "nuoc-hoa-doc",
    title: "Nước hoa — dọc 9:16",
    type: "Beauty / Lifestyle",
    desc: "Định dạng dọc cho TikTok / Reels / Shorts",
    videoUrl: "https://videos.pexels.com/video-files/5758891/5758891-hd_1080_1920_30fps.mp4",
    image: "https://images.pexels.com/videos/5758891/pexels-photo-5758891.jpeg?auto=compress&w=900",
    sortOrder: 8,
    enabled: true,
  }
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

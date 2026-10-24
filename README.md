# website

Web tĩnh giới thiệu sản phẩm, deploy lên Cloudflare Pages từ repo GitHub này.

## Cấu trúc

```
├── index.html          # Trang chủ (bắt buộc ở root)
├── 404.html            # Trang không tìm thấy
├── assets/
│   ├── images/         # logo.png, hero.webp
│   │   └── screenshots/
│   ├── icons/
│   └── fonts/
├── css/
│   └── style.css
├── js/
│   └── main.js
├── favicon.ico
├── robots.txt
├── sitemap.xml
└── _headers            # Header + cache cho Cloudflare Pages
```

## Deploy — Cloudflare Pages

- Framework preset: **None**
- Build command: *(để trống)*
- Build output directory: `/` (root của repo)
- File cài đặt lớn (> 25 MiB) không để trong repo: host ở GitHub Releases / R2
  rồi gắn link tải trong `index.html`.

## Tải công cụ (latest.json)

- Web đọc manifest tại `https://releases.hora.works/hora.media/latest.json`
  qua Pages Function `functions/releases-latest.js` (đường `/releases-latest`
  trên chính domain web) — vì file JSON ở khác domain và không có CORS.
  Function cũng thay host placeholder `<domain>` trong JSON bằng
  `releases.hora.works`.
- File cài đặt phải được upload lên bucket của `releases.hora.works` đúng
  đường dẫn trong JSON, hiện tại là:
  - `release/hora-admin/v1.0.0/linux/hora-admin_1.0.0_amd64.deb`
  - `release/hora-admin/v1.0.0/windows/HORA.Admin-product-v1.0.0-win-x64-setup.exe`
- Thiếu file ở các đường trên thì bấm tải sẽ ra trang 404 của server chứa file.

## Trước khi public

- [ ] Sửa `<title>`, mô tả và nội dung trong `index.html`
- [ ] Thay `logo.png` / `hero.webp` thật vào `assets/images/`
- [ ] Sửa `example.com` thành domain thật trong `robots.txt` và `sitemap.xml`
- [ ] Thay `favicon.ico` bằng icon thật của sản phẩm

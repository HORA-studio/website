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

## Trước khi public

- [ ] Sửa `<title>`, mô tả và nội dung trong `index.html`
- [ ] Thay `logo.png` / `hero.webp` thật vào `assets/images/`
- [ ] Sửa `example.com` thành domain thật trong `robots.txt` và `sitemap.xml`
- [ ] Thay `favicon.ico` bằng icon thật của sản phẩm

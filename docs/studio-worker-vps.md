# Đặt máy worker lên VPS (thay cho máy cá nhân)

Worker (dreamina-tool) **không bắt buộc** chạy trên máy cá nhân — nó chỉ cần
một máy Linux x86_64 chạy nền lâu dài, có ổ đĩa bền để giữ: phiên đăng nhập
Dreamina của CLI, `data/jobs.json` và file kết quả. VPS thường là đủ và rẻ.

## Vì sao không dùng Cloudflare Workers / Containers

- **Workers**: không chạy được file thực thi native, không có ổ đĩa bền,
  không có tiến trình nền dài — CLI `dreamina-canvas` không chạy được ở đây.
  (Phần web của Studio vốn đã là Pages Functions — đó là phía *server nhận
  lệnh*, không phải phía *worker chạy CLI*.)
- **Containers**: chạy được Linux + binary thật, **nhưng ổ đĩa ephemeral** —
  container ngủ (mặc định sau 10 phút không có việc) là lần khởi động sau có
  ổ đĩa *mới tinh* theo image: mất đăng nhập Dreamina, mất job đang chạy,
  mất file kết quả. Không dùng cho worker có trạng thái như tool này.

## Chuẩn bị

- VPS Ubuntu 24.04, kiến trúc **x86_64/amd64** (CLI chỉ có bản linux_amd64 —
  đừng thuê ARM), 1–2 vCPU / 2 GB RAM là đủ (việc sinh do server Dreamina làm).
- **Region nên trùng region của tài khoản Dreamina** (tài khoản đăng ký ở
  dreamina.capcut.com thường là Singapore) — giảm nguy cơ bị bắt xác minh
  lại vì đăng nhập từ vùng lạ.
- Một hostname cho tunnel, vd `tool.hora.works` (DNS nằm trên Cloudflare).

## Các bước setup trên VPS

```bash
# 1) Node.js 20+ và cloudflared
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
# cloudflared: cài theo trang downloads của Cloudflare (gói .deb)

# 2) CLI Dreamina chính thức (lệnh của nhà cung cấp — bản Linux)
#    (lệnh cài đặt do Dreamina cung cấp, chạy trên VPS giống hệt máy cá nhân)

# 3) Tool
git clone <repo website> && cd website/tools/dreamina-tool
npm install && npm run build
```

Chạy nền bằng systemd — tạo `/etc/systemd/system/dreamina-tool.service`:

```ini
[Unit]
Description=Dreamina Tool (HORA Studio worker)
After=network.target

[Service]
WorkingDirectory=/opt/website/tools/dreamina-tool
Environment=PORT=5100
Environment=TOOL_TOKEN=<chuỗi-bí-mật-dài-ngẫu-nhiên>
ExecStart=/usr/bin/node dist/index.js
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dreamina-tool
```

## Đăng nhập Dreamina trên VPS (không cần trình duyệt trên server)

CLI dùng OAuth device flow nên server headless vẫn đăng nhập được:

1. Mở UI của tool qua tunnel (hoặc `ssh -L 5100:localhost:5100` rồi mở
   http://localhost:5100 trên máy mình) → nhập `TOOL_TOKEN` khi UI hỏi.
2. Mục tài khoản, profile `default` → **Đăng nhập (OAuth)** → tool hiện
   link + mã → mở link đó trên điện thoại/máy cá nhân → đăng nhập Dreamina
   → **Authorize** (link sống ~10 phút).
3. Tool hiện tên tài khoản = xong. Phiên đăng nhập nằm trên ổ VPS, bền qua
   restart service.

## Nối về web

1. Named tunnel (URL cố định, khác quick tunnel hay đổi):
   `cloudflared tunnel create hora-tool` rồi route hostname
   `tool.hora.works` → `http://localhost:5100`, chạy cloudflared bằng
   systemd như một service thứ hai. Nhờ tunnel là kết nối ra (outbound)
   nên **không cần mở port 5100 ra internet**.
2. Cloudflare Pages → hora-website → Environment variables:
   - `STUDIO_TOOL_URL` = `https://tool.hora.works`
   - `STUDIO_TOOL_TOKEN` = đúng `TOOL_TOKEN` ở trên
   - `STUDIO_TOOL_CEILING` = trần credit tự duyệt mỗi job (vd `100`)
3. Deploy lại Pages, rồi test trọn vòng theo `docs/studio-test.md` chặng B.

## Rủi ro cần biết

- **IP datacenter khác IP nhà**: đăng nhập Dreamina từ IP lạ/vùng khác có
  thể bị bắt xác minh lại, hiếm hơn là bị hạn chế. Giảm thiểu: VPS region
  trùng region tài khoản, đăng nhập một lần rồi giữ nguyên, không nhảy IP.
  Nếu tài khoản Dreamina là tài sản quý và nhu cầu chưa cần 24/7, máy cá
  nhân (IP nhà) vẫn là lựa chọn an toàn nhất cho tài khoản.
- VPS là máy lạ trên internet: giữ `TOOL_TOKEN` bật, SSH chỉ dùng key,
  cập nhật hệ điều hành đều.
- File kết quả vẫn nằm trên ổ VPS (khách xem được 24/7 khi VPS chạy) —
  bước cuối vẫn là đẩy lên R2, xem `docs/studio.md`.

# Dreamina Tool (Local) — bản CLI chính thức

Tool chạy local bằng **TypeScript / Node.js**, bọc quanh **dreamina-canvas CLI
chính thức** do Dreamina/CapCut phát hành. Không còn dùng sessionid/cookie hay
API không chính thức: đăng nhập bằng **OAuth** của Dreamina ngay trong tool,
mọi thao tác sinh ảnh/video đều qua CLI.

## 1. Cài dreamina-canvas CLI (lệnh của nhà cung cấp)

macOS / Linux:

```bash
curl -fsSL https://dreamina.capcut.com/canvas-cli/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://dreamina.capcut.com/canvas-cli/install.ps1 | iex
```

Windows CMD:

```bat
curl.exe -fsSLO https://dreamina.capcut.com/canvas-cli/install.bat && install.bat
```

CLI được cài vào `~/.local/bin/dreamina-canvas` (Windows: `~/bin`). Tool tự tìm
binary ở PATH và 2 vị trí trên; nếu để chỗ khác, đặt biến môi trường
`DREAMINA_BIN` trỏ tới file binary.

Kiểm tra: `dreamina-canvas --format json version`

## 2. Chạy tool

```bash
npm install
npm run build
npm start
```

Mở http://localhost:5100 (đổi cổng bằng biến `PORT`).

## 3. Dùng

1. **Đăng nhập**: nhập tên profile (mỗi profile = 1 tài khoản Dreamina, mặc
   định `default`) → bấm *Đăng nhập (OAuth)* → bấm link, đăng nhập + Authorize
   trên trang Dreamina → tool tự nhận khi xong. Thông tin tài khoản, gói và
   credit hiện ngay trong tool (lấy qua `auth account`).
2. **Canvas**: chọn canvas có sẵn hoặc để tool tự tạo. Canvas mở xem trực tiếp
   được trên web Dreamina qua link trong tool.
3. **Tạo ảnh/video**: chọn model (danh sách thật do CLI trả về theo tài
   khoản), nhập prompt, tỉ lệ/độ phân giải/thời lượng, đính kèm ảnh nếu cần
   (ảnh → ảnh tham chiếu; video → khung đầu/khung cuối).
4. **Credit**: mỗi job đều qua bước báo giá của CLI. Đặt *Trần credit tự
   duyệt* > 0 để job tự chạy khi giá nằm trong trần; giá vượt trần thì job
   dừng ở trạng thái **Chờ duyệt** — bạn bấm duyệt mới chạy tiếp. Kết quả tải
   về `data/results/<job-id>/` và hiện ngay trong trang.

## Kiến trúc

- `src/cli.ts` — tìm binary + chạy lệnh CLI (`--format json`), dùng cho mọi thao tác.
- `src/auth.ts` — luồng device flow: `auth login` lấy link/mã, chạy nền `auth wait` tới khi user ủy quyền xong.
- `src/jobs.ts` — pipeline 1 job: tạo canvas → upload ảnh đính kèm (`resource upload`) → tạo node (`node create`) → báo giá (`node quote`) → duyệt (`node confirm`) → chạy (`node run`) → theo dõi (`operation status`) → tải kết quả (`resource download`). Job lưu ở `data/jobs.json`, server khởi động lại vẫn khôi phục theo dõi các job đang chạy.
- `src/server.ts` + `public/index.html` — API local + giao diện tiếng Việt.

Mọi bước của job đều ghi log có giờ giấc trong thẻ job — lỗi ở đâu nhìn thấy ở đó,
kèm mã lỗi và chi tiết chẩn đoán gốc của CLI.

## Chạy làm worker cho HORA Studio (web gọi vào)

Khi tool chạy trên máy worker để nhận lệnh từ web (xem
`docs/studio-test.md` trong repo website để có hướng test trọn vòng):

1. Máy worker cài: **dreamina-canvas CLI** (mục 1) + **cloudflared**
   (Cloudflare Tunnel) để web với tới tool.
2. Đăng nhập Dreamina trong tool (profile `default` — đúng profile phía web dùng).
3. Chạy tool kèm token chung, ví dụ:
   `TOOL_TOKEN=<chuỗi-bí-mật> npm start`
   rồi mở tunnel: `cloudflared tunnel --url http://localhost:5100`
4. Phía Cloudflare Pages đặt biến: `STUDIO_TOOL_URL` = URL tunnel,
   `STUDIO_TOOL_TOKEN` = đúng chuỗi bí mật trên, `STUDIO_TOOL_CEILING` =
   trần credit Dreamina tự duyệt mỗi job (nên đặt > 0, vd 100, nếu không mọi
   job từ web sẽ dừng chờ duyệt tay trong tool).

Khi `TOOL_TOKEN` bật, mọi `/api/*` và `/files/*` phải có header
`x-tool-token` — phía web tự gửi khi `STUDIO_TOOL_TOKEN` được đặt; UI của
chính tool sẽ hỏi token 1 lần (lưu trong session của trình duyệt).
**Không bật token thì tuyệt đối không phơi tool ra internet**: ai có URL
cũng tạo job và tiêu credit Dreamina được.

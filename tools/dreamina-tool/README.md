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

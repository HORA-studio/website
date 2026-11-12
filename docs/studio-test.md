# HORA Studio — hướng test vòng lệnh User → Web → Máy worker → Dreamina

## Vòng lệnh hoạt động thế nào

1. Khách vào Studio trên web, bấm **Tạo** → `POST /api/studio/generations`:
   web trừ credit trước, ghi 1 dòng `studio_generations` trạng thái `queued`.
2. Ngay trong request đó, web đẩy job sang máy worker qua biến môi trường
   `STUDIO_TOOL_URL` (`POST {TOOL}/api/jobs`) và lưu `toolJobId` vào generation.
3. Máy worker (chạy **dreamina-tool**) nhận job → gọi `dreamina-canvas` CLI
   (đã đăng nhập Dreamina bằng OAuth) → tạo canvas/node → báo giá → duyệt
   credit → chạy → theo dõi tới khi xong → tải file kết quả về
   `data/results/<jobId>/` của tool.
4. Web **tự đồng bộ khi khách mở danh sách kết quả**
   (`GET /api/studio/generations`): tool `done` → web `done` +
   `result_url = {STUDIO_TOOL_URL}/files/<jobId>/<file>`; tool `failed` →
   web `failed` + **hoàn 100% credit**; tool đang chạy → web `working`.
   Không có kênh push riêng — khách F5/mở lại Studio là thấy trạng thái mới.
5. Khách xem/tải kết quả ngay trong Studio của họ (link file trỏ về máy
   worker qua tunnel — máy worker tắt thì link chết, xem mục Lưu ý).

## Máy worker cần cài gì

| Thứ | Để làm gì | Cài |
|---|---|---|
| Node.js 18+ | Chạy dreamina-tool | nodejs.org |
| dreamina-canvas CLI | Gọi Dreamina chính thức | Lệnh của nhà cung cấp (xem README trong `tools/dreamina-tool/`) |
| cloudflared | Mở đường cho Cloudflare với vào tool trên máy worker | `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/` |

## Chặng A — test nửa vòng (chỉ máy worker, không cần tunnel)

Mục đích: chứng minh worker tự nhận việc và sinh được ảnh/video thật.

1. `cd tools/dreamina-tool && npm install && npm run build`
2. Chạy có token ngay từ đầu (quen tay cho chặng B):
   - Linux/macOS: `TOOL_TOKEN=test123 npm start`
   - Windows PowerShell: `$env:TOOL_TOKEN="test123"; npm start`
3. Mở http://localhost:5100 → UI hỏi token → nhập `test123`.
   Giao diện quản trị CHỈ mở ở localhost trên chính máy worker; mở qua
   địa chỉ tunnel (tool.hora.works) sẽ ra 404 — khách chỉ dùng Studio,
   phía web gọi API qua cổng token như thường, không bị ảnh hưởng.
4. Mục tài khoản: profile `default` → **Đăng nhập (OAuth)** → bấm link →
   đăng nhập Dreamina + Authorize → tool hiện tên tài khoản + credit.
5. Tạo thử 1 job ảnh prompt ngắn ngay trong UI của tool.
   - Đạt: job chạy qua các bước trong log và kết quả hiện trong thẻ job.
   - Job dừng ở *Chờ duyệt* là đúng thiết kế khi trần tự duyệt = 0:
     hoặc bấm **Duyệt** trong thẻ job, hoặc đặt trần lúc tạo job.

## Chặng B — test trọn vòng (web → worker → web)

Điều kiện trước:

- Migration Studio đã chạy trên D1 (`db/migrate-studio-2026-11-11.sql` +
  `db/migrate-studio-topup-2026-11-11.sql`). Kiểm tra nhanh: mở Studio trên
  web, xem số credit — lỗi bảng/`no such table` là chưa chạy migration.
- Tool đang chạy như chặng A, đã đăng nhập Dreamina, và đặt
  trần tự duyệt: khởi động lại tool hoặc tạo job từ web sẽ dùng
  `STUDIO_TOOL_CEILING` (bước 3).

Các bước:

1. Trên máy worker, mở tunnel thử nghiệm:
   `cloudflared tunnel --url http://localhost:5100`
   → ghi lại URL dạng `https://xxxx.trycloudflare.com`
   (URL này **đổi mỗi lần chạy lại tunnel** — chỉ để test).
2. Vào Cloudflare Dashboard → Pages → hora-website → Settings →
   Environment variables, đặt (Production):
   - `STUDIO_TOOL_URL` = URL tunnel ở bước 1
   - `STUDIO_TOOL_TOKEN` = `test123` (khớp `TOOL_TOKEN` của tool)
   - `STUDIO_TOOL_CEILING` = `100` (trần credit Dreamina mỗi job web;
     để 0 thì mọi job web dừng chờ duyệt tay trong tool)
   Đặt xong cần **deploy lại** (hoặc chờ commit kế tiếp) để Functions nhận biến.
3. Mở web Studio (đăng nhập tài khoản HORA có credit — nạp thử bằng mã/topup
   nếu ví đang 0):
   - Danh sách model chuyển sang model Dreamina thật = web đã gọi được tool.
   - Sidebar có khối Dreamina: chấm xanh + tên tài khoản = tool đã đăng nhập.
4. Tạo 1 ảnh rẻ nhất, prompt ngắn. Quan sát trong Studio:
   `queued → working → done` và ảnh hiện trong thư viện; số credit bị trừ
   đúng giá model. Sang UI của tool sẽ thấy job tương ứng đang chạy/đã xong
   (đối soát bằng `toolJobId` trong `params` của generation nếu cần).
5. Test đường lỗi (hoàn tiền): tắt tunnel (hoặc tắt tool) rồi tạo 1 job nữa:
   - Web giữ generation ở `queued` với dấu `toolError=unreachable` (không mất
     tiền oan ngoài khoản đã trừ chờ xử lý), hoặc khi tool từ chối job thì
     web báo lỗi và **hoàn credit ngay**.
   - Bật lại tool, để job lỗi ở bước sinh (vd prompt bị chặn): khi khách mở
     lại danh sách, trạng thái chuyển `failed` + credit được hoàn — kiểm tra
     ở sổ credit trong Studio.

## Lưu ý vận hành

- **Token là bắt buộc khi có tunnel**: không đặt `TOOL_TOKEN`/
  `STUDIO_TOOL_TOKEN` thì bất cứ ai có URL tunnel cũng tạo job và tiêu
  credit Dreamina được.
- **File kết quả**: từ bản 2026-11-12 (hàng đợi), khi job xong web **tự kéo
  file về R2** (binding `STUDIO_MEDIA`) và phát qua route có đăng nhập
  `/api/studio/media?id=...` — link bền trên hora.works, máy worker tắt
  cũng xem được; mục done cũ chưa có bản R2 sẽ được kéo bổ sung dần mỗi
  lần khách mở danh sách. Muốn bật: (1) Cloudflare → R2 → tạo bucket
  (vd `hora-studio-media`); (2) Pages → Settings → Functions → R2 bucket
  bindings → thêm binding tên `STUDIO_MEDIA` trỏ vào bucket đó
  (Production); (3) deploy lại 1 lần. Chưa gắn binding thì web tự dùng
  link tunnel như cũ (máy worker tắt = link chết).
- **Hàng đợi phía tool**: mỗi tài khoản Dreamina tối đa 1 job chạy tại một
  thời điểm, toàn máy tối đa 3 job đồng thời; job web không chỉ định tài
  khoản nên tool tự gán vào tài khoản đang rảnh có hàng đợi ngắn nhất.
  Một đơn web luôn mang `clientRef` = id của đơn — mạng chập chờn gửi
  trùng cũng chỉ chạy một job.
- **Quick tunnel chỉ để test**: muốn URL cố định thì tạo *named tunnel*
  trong Cloudflare (hostname riêng, vd `tool.hora.works`) trỏ về
  `localhost:5100`, rồi đặt `STUDIO_TOOL_URL` theo hostname đó 1 lần.
- Job web nào cũng qua bước báo giá của CLI: giá Dreamina thật có thể khác
  giá credit web đang tính tạm trong `_studio.js` — chốt giá thật trước khi
  mở bán.

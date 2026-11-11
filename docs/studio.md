# HORA Studio — gen ảnh/video trên web (nhánh `feature/ai-studio`)

Mục **Studio** nằm ngay trong trang chủ `index.html` (view `#/studio`, theo đúng
cơ chế 2 view có sẵn của trang: `#/` trang chủ, `#/gia` bảng giá, `#/studio` studio):
người dùng đăng nhập, mua credit, tạo ảnh/video, kết quả lưu **30 ngày** trong
thư viện riêng của từng tài khoản. Đường cũ `/studio.html` chỉ còn là trang
chuyển hướng sang `/#/studio`.

## Nguồn layout

Clone flow + bố cục của **ShrimpReel** (`github.com/qianshuixia/shrimpreel`, MIT):

| ShrimpReel | HORA Studio (bản này) |
|---|---|
| Hero: Generator trái 430px / ví dụ phải, tab chọn style dạng pill | Hero `studio.html`: gen-card trái (430px) / lưới thẻ Gốc–AI + khung “Kết quả mới nhất” phải |
| Generator 3 bước: ảnh → style → độ dài, nút hiện giá credit | 3 bước: Prompt/ảnh gốc → Model (giá credit cạnh tên) → Khung hình/Thời lượng, nút “Tạo ngay — X credit” |
| Thử trước khi đăng nhập, giữ lựa chọn qua login/checkout | Chưa đăng nhập vẫn xem thử được (mô phỏng trong trình duyệt); đăng nhập rồi thì gọi API thật |
| Dashboard: header email + chip credit + nút Buy/New, tabs Videos/Billing/Settings gạch chân | “Studio của tôi”: tabs **Thư viện / Thanh toán & credit / Cài đặt** |
| Pricing: credit packs + subscription | `#pricing`: 2 gói credit lẻ + 1 gói tháng (giá tạm) |
| Ví credit + ledger append-only, trừ trước khi queue, hoàn khi lỗi | `studio_credit_ledger` (số dư = SUM), POST generations trừ trước, worker lỗi → `refund` |
| Ảnh gốc xoá 7 ngày, video xoá 30 ngày | `expires_at = created_at + 30 ngày`; GET tự đánh dấu `expired` |
| Upload từ điện thoại bằng QR | Khối QR trong bước 1 (mô phỏng ở bản xem thử; nối `/phone-upload` sau) |

Theme giữ theo website hiện tại (biến `--bg/--card/--accent` của `index.html`,
tự đổi sáng/tối theo hệ thống) để trang không lệch tông với phần còn lại.

## Đã có trong nhánh này

- `index.html` (view `#view-studio`) — toàn bộ giao diện + JS của Studio, gộp từ
  bản `studio.html` độc lập trước đây: CSS đóng scope `.studio-scope`, mọi id gắn
  tiền tố `st-` để không đụng id sẵn có của trang chủ (`libGrid`, `libFilters`…),
  JS chạy trong IIFE riêng. Nội dung: đổi mode ảnh/video, chọn model/tỉ lệ/
  thời lượng, tính giá trực tiếp, thư viện lọc theo loại, đếm ngược ngày còn lại,
  sổ credit, redeem/invite/export (bản xem thử chạy bằng localStorage khi chưa
  đăng nhập hoặc API chưa sẵn sàng — có pill trạng thái ở header).
- `functions/api/studio/credits.js` — `GET /api/studio/credits`: số dư + 100 dòng
  ledger gần nhất của chính khách (`requireAuth` dùng chung `_lib.js`).
- `functions/api/studio/generations.js` —
  `GET` list của chính khách (tự đánh dấu hết hạn), `POST` tạo (validate, tính
  giá, trừ credit, `queued`, hết hạn +30d), `DELETE ?id=` xoá mục của chính mình.
- `functions/api/studio/_studio.js` — bảng model/giá tạm, gói credit, helper ví.
- `db/migrate-studio-2026-11-11.sql` + đã nối vào `db/schema.sql`:
  `studio_credit_ledger`, `studio_generations`.
- `index.html` — nav (desktop + mobile) có mục “Studio AI” trỏ `#/studio`
  (`data-nav="studio"`); router `showView/route` đã thêm nhánh `studio`
  (bật/tắt bằng class `body.studio` như `body.pricing` của bảng giá).

## Chưa nối (bước tiếp theo, theo thứ tự)

1. **Migration lên D1 thật**: `wrangler d1 execute hora-website --remote --file
   db/migrate-studio-2026-11-11.sql` (chạy `--local` trước khi test bằng
   `wrangler pages dev`).
2. **R2 cho file kết quả**: tạo bucket, thêm binding `STUDIO_MEDIA` cho Pages
   (dashboard) — `wrangler.toml` ở repo chỉ giữ tham chiếu D1, binding Pages
   đang set qua dashboard như các binding hiện có.
3. **Worker/Queue xử lý gen**: consumer đọc `studio_generations status='queued'`,
   gọi provider (fal.ai mặc định như ShrimpReel, hoặc Dreamina qua
   `dreamina-tool`), tải file về R2 (`result_key`), set `done` + `result_url`;
   lỗi/timeout → `failed` + `addLedger(..., 'refund', generationId)` hoàn 100%.
4. **Nạp credit từ thanh toán thật**: trong webhook/IPN của orders (SePay/MoMo/
   VNPay) — khi khách mua gói credit Studio, gọi
   `addLedger(env, customerId, +credits, 'purchase', orderId, ...)`. Cần tách
   loại đơn “license” (hiện tại) với đơn “credit Studio” (thêm `orders.kind`
   hoặc plan riêng) trước khi mở bán.
5. **Cron dọn file hết hạn**: Worker cron hằng ngày xoá object R2 của các dòng
   `expires_at < now` (kết quả) và ảnh gốc sau 7 ngày.
6. **Chốt giá thật** trong `_studio.js` + `studio.html` (đang là giá tạm) và
   admin: xem generations toàn hệ thống, cộng/trừ credit tay, mã redeem thật
   (bảng `studio_redeem_codes`).

## Rủi ro cần nhớ khi mở bán

- Trừ credit ở POST là check-rồi-ghi theo request (đủ an toàn ở quy mô hiện
  tại); khi có nhiều request đồng thời của cùng 1 khách, chuyển sang trừ bằng
  1 câu UPDATE có điều kiện trong worker để chống chi tiêu vượt số dư.
- `result_url` không được là link R2 công khai vĩnh viễn: dùng route proxy qua
  Function có `requireAuth` hoặc signed URL ngắn hạn, nếu không người khác có
  link là xem được thư viện của khách.

## Kết nối Dreamina Tool (provider gen thật) — 2026-11-11

Tool nằm trong repo tại `tools/dreamina-tool/` (TypeScript/Node, bọc
`dreamina-canvas` CLI chính thức; xem README trong thư mục đó). Tool chạy
trên máy có đăng nhập Dreamina (OAuth), nghe HTTP ở `PORT` (mặc định 5100):

- `POST /api/jobs` {kind, prompt, model, ratio, duration, creditCeiling, refs} → 201 {job}
- `GET /api/jobs`, `GET /api/jobs/:id` — trạng thái: queued / working /
  awaiting_approval / done / failed / interrupted; `job.results[].file` là
  tên file kết quả, `job.error` là lỗi gốc từ CLI.
- `GET /files/<jobId>/<file>` — tải file kết quả từ `data/results/<jobId>/`.
- Kho tài nguyên của khách = các job của tool (danh sách + file ở `/files/`);
  phía web, mỗi generation lưu `params.toolJobId` để đối soát 1–1.

Dây nối phía web (đã code trong `functions/api/studio/`):

- Chỉ bật khi đặt biến môi trường `STUDIO_TOOL_URL` (vd `http://127.0.0.1:5100`
  khi tool chạy cùng máy, hoặc URL tunnel/public của máy chạy tool). Chưa đặt
  → hành vi cũ: generation dừng ở `queued`.
- `POST /api/studio/generations`: sau khi trừ credit + ghi generation, đẩy
  job sang tool; tool nhận → `working` + lưu toolJobId; tool từ chối (HTTP
  lỗi) → hoàn credit 100% + `failed` + trả 502; tool không tới được (mạng) →
  giữ `queued`, ghi `params.toolError='unreachable'` để đối soát sau.
- `GET /api/studio/generations`: đồng bộ các mục đang queued/working có
  toolJobId — tool `done` → web `done` + `result_url` trỏ `/files/...` của
  tool; tool `failed`/`interrupted` → web `failed` + hoàn credit (chỉ hoàn
  khi UPDATE có guard trạng thái thắng, chống hoàn trùng); tool
  `awaiting_approval` → giữ nguyên phía web (duyệt credit làm trong tool).
- `STUDIO_TOOL_CEILING`: trần credit Dreamina tự duyệt mỗi job (0 = mọi job
  chờ duyệt tay trong tool — an toàn khi mới nối). `STUDIO_TOOL_IMAGE_MODEL`
  / `STUDIO_TOOL_VIDEO_MODEL`: ghi đè model id phía Dreamina (danh sách model
  thật lấy từ `GET /api/models` của tool theo tài khoản đã đăng nhập).

Điều kiện để chạy thật (chưa xong): (1) đăng nhập Dreamina trong tool trên
máy chạy tool (OAuth — job test 2026-11-11 chạy đúng pipeline và dừng ở
"Authentication is required"); (2) máy chạy tool phải tới được từ
Cloudflare Functions (URL public/tunnel) nếu web chạy trên Pages thật —
hoặc chạy cả web lẫn tool cùng máy khi dùng local; (3) chạy migration D1 +
đặt các biến môi trường trên.

## Model thật từ tool + nạp tiền QR/token (2026-11-11)

### Model + mốc thời lượng trên UI
- `GET /api/studio/models` (không cần đăng nhập): khi có `STUDIO_TOOL_URL`,
  proxy `GET /api/models?type=image|video` của Dreamina Tool và chuẩn hoá
  schema CLI (model/displayName/modes[].flags) thành {id, name, desc, cost,
  perSecond, durations[], ratios[]} — durations rút từ flag duration
  (min–max/step, tối đa 8 mốc), ratios từ flag ratio. Tool lỗi/chưa đăng nhập
  Dreamina → trả danh mục tĩnh trong `_studio.js` (source: "static").
- UI Studio tự gọi endpoint này khi mở: dropdown model, pill tỉ lệ và pill
  thời lượng dựng theo đúng model đang chọn; giá web tạm (model lạ: ảnh 10cr,
  video 6cr/giây — chỉnh trong models.js `DEFAULT_PRICE`).
- `generations` POST chấp nhận model id của tool khi đã nối (resolveModel),
  thời lượng video nhận 1–60s theo model (không nối tool vẫn kẹp 5/10s).

### Nạp tiền: QR → token → credit
- Bấm 1 gói nạp (tab Mua credit hoặc view #/mua) → mở modal QR: số tiền đúng
  gói, nội dung chuyển khoản `HORAxxxxxx` sinh riêng mỗi lần mở, ảnh QR từ
  VietQR (`img.vietqr.io`) theo cấu hình `QR_CFG` trong index.html
  (bank = mã ngân hàng, account = số tài khoản, name = chủ tài khoản) —
  **chủ shop điền thông tin thật vào QR_CFG**; chưa điền thì modal hiện
  khung nhắc cấu hình, vẫn xem được số tiền/nội dung.
- (ĐÃ BỎ 2026-11-11 theo chốt của chủ shop: không còn đường dán mã/token —
  endpoint redeem, bảng `studio_redeem_tokens` và mọi ô nhập mã trên UI đã
  gỡ. Nạp tiền chỉ còn luồng tự động ở mục dưới.)

### Tự động cộng credit khi nạp (SePay) — 2026-11-11
- `POST /api/studio/topup` {pack} (đăng nhập): tạo phiên nạp `studio_topups`
  trạng thái pending + mã riêng `STUxxxxxxxx` (tái dùng phiên pending cùng
  gói trong 24h); trả kèm `instructions` = QR VietQR + ngân hàng/số tài khoản
  lấy từ cấu hình SePay sẵn có của website (`buildSepayInstructions`), nên
  UI không cần QR_CFG khi SePay đã cấu hình.
- Webhook SePay hiện có (`/api/payments/sepay-webhook`) có thêm nhánh Studio
  chạy trước luồng đơn hàng: quét mã STU trong nội dung chuyển khoản, số
  tiền phải bằng đúng `amount_vnd` (lệch → log `studio.topup_amount_mismatch`,
  không cộng, phiên giữ pending); khớp → UPDATE có guard pending→paid +
  `addLedger 'topup'` cộng credit đúng 1 lần (SePay gửi lại webhook cũng
  không cộng trùng — đã test giả lập D1: đúng/sai key, đúng/sai tiền, retry).
- UI: bấm Nạp (đã đăng nhập) → modal QR dùng mã server cấp + dòng trạng thái
  "Đang chờ chuyển khoản…"; UI tự hỏi `GET /api/studio/topup?code=` mỗi 4s,
  thấy paid thì báo "Đã nhận +X credit" và tải lại số dư. Chưa đăng nhập →
  nhắc đăng nhập trước (credit phải cộng vào 1 tài khoản).
- Thông báo nhận thành công: nếu khách đóng modal trước khi tiền tới, lần
  tải dữ liệu thật kế tiếp UI gọi `GET /api/studio/topup` (danh sách phiên
  gần đây), phiên nào paid trong 7 ngày mà chưa từng báo (ghi nhớ theo id
  trong localStorage `hora.studio.topupNotified.v1`) thì hiện toast
  "Nạp thành công: +X credit đã cộng vào tài khoản của bạn!" đúng 1 lần.
- Điều kiện chạy thật: cấu hình SePay của website (SEPAY_* env + webhook
  API key) — vốn đã dùng cho đơn license — và chạy migration
  `db/migrate-studio-topup-2026-11-11.sql`.
- Màn hình báo thành công (bản trước chỉ là toast): khi tiền vào, modal QR
  tự đóng và bật MÀN THÀNH CÔNG ở giữa app (dấu ✓ lớn, "+X credit", số dư
  hiện tại, nút "Bắt đầu tạo ngay"/"Đóng"). Ngay trước khi bật, UI gọi
  `GET /api/studio/credits` lấy số dư thật và cập nhật mọi chỗ hiện credit
  (sidebar, pill, số dư lớn, sổ cái) — credit trên app đổi ngay tại chỗ.
  Trường hợp khách quay lại sau cũng bật đúng màn này (thay cho toast).

## Cập nhật UI 2026-11-11 (tối)

- Item đang tạo: thumbnail mặc định + vòng xoay, xong tự cập nhật thumbnail.
- Đính kèm nhiều ảnh theo `references.max` của model, chips trong ô prompt
  (ở đáy ô), nút X từng ảnh, giữ qua chuyển tab.
- Thẻ đã tạo xong chỉ còn 1 nút "Tải xuống"; Kho trải full như tab Tạo;
  thẻ Mua credit xếp giữa, gọn.
- Bỏ hẳn logo chữ "HORA STUDIO" (`.st-side-brand`) khỏi Studio ở mọi
  kích thước. Mobile: top bar 1 hàng — avatar trái, credit + Đăng xuất
  phải; cụm prompt ghim sticky, chỉ Kết quả cuộn.

## Đăng nhập Dreamina (theo logic của Dreamina Tool — bản zip)

- Luồng OAuth device flow chính thức qua CLI của tool: `POST /api/auth/login` → link ủy quyền + mã nhập tay + hạn; tool tự chạy vòng chờ (`auth wait`) ở nền; trạng thái đọc qua `GET /api/auth/status?profile=default`; `POST /api/auth/logout` để đăng xuất. Profile cố định `default` (cùng profile seam generations dùng).
- Web proxy qua `functions/api/studio/tool-auth.js` (bắt buộc đăng nhập HORA — link/mã ủy quyền không phơi công khai):
  - `GET /api/studio/tool-auth` → `{connected, loggedIn, account, pending, binaryMissing, error}`; chưa đặt `STUDIO_TOOL_URL` → `{connected:false}`.
  - `POST /api/studio/tool-auth` `{action:"login"}` → `{pending}`; `{action:"logout"}` → `{ok:true}`.
- UI: khối "Dreamina" trong sidebar của studio.html — chấm trạng thái + nút Đăng nhập/Đăng xuất; khi chờ ủy quyền hiện link + mã + giờ hết hạn và tự poll 4 giây/lần tới khi đăng nhập xong hoặc mã hết hạn (đúng flow UI của tool).

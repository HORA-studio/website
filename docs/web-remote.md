# Web Remote — SPEC trang điều khiển responsive (điện thoại + máy tính)

> **Trạng thái: SPEC + ĐÃ CODE phần lớn phía website.** Mục Remote trong
> tài khoản (registry, ghép nối) đã code 2026-11-04; **shell điều khiển
> native ngay trong mục Remote cũng ĐÃ CODE 2026-11-04 (xem bổ sung ở
> mục 0)** — phần còn ở dạng spec là trang `/remote/` đứng riêng (mục 3)
> và các điểm chưa chốt ở mục 14.
>
> Nguồn thiết kế: `web-remote-web-todo.md` (trích từ `docs/web-remote-todo.md`,
> repo video-builder, Job 218; kiến trúc chốt 2026-11-03; trạng thái sau
> WR-01..WR-16). File nguồn là gốc — spec này không sửa hay thay thế nó,
> chỉ bổ sung phần web responsive + các hệ quả khi mang trang ra ngoài app.

## 0. Bổ sung 2026-11-04 — lối vào qua trang tài khoản (chốt của user, ưu tiên hơn mục 3–4)

User chốt: **đăng nhập xong phải có mục Remote ngay trong trang tài khoản,
có chỗ quét mã QR hoặc nhập mã để mở view điều khiển — kiểu Chrome Remote
Desktop.** Lối vào đứng riêng ở `/remote/` + dán URL Tunnel (W0 cũ) không
còn là luồng chính; W0 hạ xuống mục "Nâng cao / dự phòng" trong màn kết nối.

- **Vị trí:** `account.html` sau đăng nhập, sidebar thêm mục thứ 4 "Remote"
  (sau Thông tin / Mua gia hạn / Lịch sử giao dịch). Chưa đăng nhập mà mở
  link Remote thì đưa về đăng nhập rồi quay lại (mẫu `/link?code=` đã có).
- **Hai cách kết nối trong mục Remote:**
  1. **Quét QR:** app hiện QR trên màn hình máy tính; web dùng camera
     (BarcodeDetector / thư viện quét) đọc QR ngay trong mục Remote.
  2. **Nhập mã 6 số** hiện cùng chỗ với QR trong app, ô nhập kiểu code-row.
- **Hệ quả kỹ thuật bắt buộc — registry trên website:** mã 6 số do app tự
  sinh và tự kiểm (`POST {tunnel}/remote/pair`), website không tự biết mã
  thuộc máy nào, và URL Tunnel đổi mỗi lần mở app. Muốn "chỉ nhập mã là
  nối được" như Chrome Remote (họ có server trung tâm tra mã → máy) thì
  app phải **đăng ký lên website khi mở**, đây là việc mới cả 2 phía:
  - Phía app (mới): sau khi có Tunnel + mã ghép, app gọi
    `POST /api/app/remote-register` (xác thực bằng phiên app/license như
    bootstrap) với `{tunnelUrl, code, deviceName}`; đăng ký lại khi đổi
    URL/mã; huỷ khi app đóng.
  - Phía website (mới): bảng D1 `remote_registrations` (`account_id`,
    `device_name`, `tunnel_url`, `code_hash`, `expires_at`, `created_at`;
    chỉ lưu hash của mã, mã sống tối đa 10 phút, 1 tài khoản tối đa 1
    đăng ký đang sống — khớp luật 1 slot) + `POST /api/remote/lookup`
    (cookie đăng nhập web, rate-limit thử mã, **chỉ trả Tunnel của chính
    tài khoản đang đăng nhập**).
  - **QR trong app** = link `https://hora.works/account.html?remote_code=<mã>`
    (quét bằng camera thường cũng mở đúng mục Remote và tự điền mã; quét
    trong mục Remote thì đọc mã từ link đó).
- **Sau khi tra được Tunnel:** giữ nguyên hợp đồng cũ — `POST /remote/pair`
  → poll `/remote/pair/status` → máy tính duyệt → nhận token → mở shell
  điều khiển 6 mục (mục 7). Duyệt trên máy tính vẫn là lớp bảo vệ cuối,
  registry không bỏ qua bước duyệt.
- **Trạng thái bổ sung này:** **ĐÃ CODE phần website 2026-11-04** (user
  duyệt "làm đi"): bảng `remote_registrations` (`db/schema.sql` +
  `db/migrate-remote-2026-11-04.sql`), `POST /api/app/remote-register` +
  `POST /api/app/remote-unregister` (xác thực bằng appToken của app hoặc
  X-Identity-Secret + userId khi worker gọi), `POST /api/remote/lookup`
  (cookie web, rate-limit 10 lần sai/10 phút, chỉ trả Tunnel của chính
  tài khoản), mục Remote trong `account.html` (mục sidebar thứ 4: quét QR
  bằng BarcodeDetector, 6 ô nhập mã, tra mã → `POST {tunnel}/remote/pair`
  → poll `/remote/pair/status` mỗi 3s → lưu token localStorage; ô URL
  Tunnel ở mục Nâng cao bỏ qua bước tra mã). Hợp đồng phía app để áp ở
  local: `docs/remote-registry-app-spec.md`. **Chưa code:** đăng ký + QR +
  CORS phía app (ở repo app local).

- **Bổ sung 2026-11-04 ~22:57 — shell native tại chỗ (chốt mới của user,
  thay hướng "mở trang nhúng của app" và bỏ chờ WR-10):** user chốt làm
  mức triệt để ngay: ghép xong mở **view điều khiển ngay trong mục
  Remote**, không mở link Tunnel, không hiện token ở thanh địa chỉ.
  **ĐÃ CODE trong `account.html`:** shell 6 mục (Tổng quan / Tạo task /
  Workflow / Trợ lý / Kho / Drive) gọi thẳng các route ở mục 5–6 bằng
  base + token đã lưu, gồm WebSocket live + poll dự phòng 5s, xử lý 409
  confirmToken, lỗi 400 thiếu size hiện nguyên văn, 401/4001 → về màn
  ghép. Nút/link mở trang app ngoài đã gỡ hẳn. Vì shape JSON thật vẫn
  chưa có (mục 11), mọi cách đọc field nằm trong **1 lớp adapter `SF`**
  ở đầu phần shell trong `account.html` và mỗi panel có khu **"Dữ liệu
  thô"** hiện JSON gốc để đối chiếu khi test với app thật — lệch field
  thì chỉ sửa `SF`. UI đang ở mức tạm đủ test, user tự sửa UI sau.
  Đã kiểm chứng bằng Chromium thật với mock app đúng hợp đồng:
  25/25 đạt (ghép sẵn phiên → shell, đủ 6 mục, dừng job, lỗi size,
  409 workflow, chat, kho + Up Drive, Drive, WS `job.done` tự cập nhật,
  điện thoại 390px không cuộn ngang, token hết hạn về màn ghép).
  **Chưa kiểm chứng với app thật** — chờ user test trên máy local và
  báo lại field lệch nếu có.

## 1. Mục tiêu và phạm vi

- Dựng lại trang điều khiển remote của app HORA Media thành **một trang web
  độc lập trong repo website** (đề xuất: `hora.works/remote/`), mở bằng trình
  duyệt trên **cả điện thoại và máy tính**, không cần cài thêm gì.
- Trang này chỉ là **bề mặt điều khiển**: mọi việc nặng vẫn chạy trong app
  desktop. Không có server trung tâm riêng.
- Bám đúng hợp đồng API đã chạy trong app (mục 5–6). Không đổi route,
  không đổi ngữ nghĩa, không viết đường chạy riêng ở phía web.

**Thuộc phạm vi spec này**

- W0 (mới, xem mục 2): màn nhập URL Tunnel — hệ quả bắt buộc khi tách trang
  ra khỏi app.
- W1–W6 làm lại theo hợp đồng cũ, trình bày responsive 2 nền tảng (mục 7).
- Yêu cầu phía app để trang ngoài gọi được API (CORS — mục 10). Phần này là
  *yêu cầu*, không phải code trong repo website.

**Không thuộc phạm vi**

- Server S1–S7: đã xong trong app (WR-01..WR-09, WR-13, WR-14), không làm lại.
- Trang mobile nhúng trong app (WR-10): giữ nguyên làm bản dự phòng
  same-origin; spec này không thay thế hay gỡ nó.
- App desktop, tunnel (S6), Drive OAuth ở phía app, bot Telegram (WR-15).

## 2. Kiến trúc và 4 hệ quả khi mang trang ra ngoài

Kiến trúc đã chốt (2026-11-03):

- **Client** = máy tính cài app HORA Media (chạy mọi thứ nặng).
- **Server** = server web nhỏ nhúng trong app (`HttpListener`, chỉ nghe
  `127.0.0.1`, port do hệ điều hành cấp, ghi vào log + Settings) +
  cloudflared làm Tunnel ra Internet.
- **Website** = trang điều khiển này.
- Kết quả gửi đi qua **Google Drive của chính user** (OAuth, quota của họ,
  scope `drive.file`).
- Slot = 1 license = 1 máy tính + 1 phiên điều khiển đang active. Đổi máy
  miễn phí (ghép lại + duyệt trên máy tính). 2 người điều khiển cùng lúc
  bị chặn.

Trang nhúng cũ được chính app phục vụ ở `GET /` nên **cùng origin** với API.
Mang ra `hora.works` làm phát sinh 4 việc mà file nguồn chưa nhắc:

1. **CORS (việc phía app, mục 10).** Trình duyệt ở origin
   `https://hora.works` gọi sang origin Tunnel là cross-origin: mọi `fetch`
   kèm header `Authorization` sẽ bị chặn nếu server trong app không trả
   header CORS đúng. Đây là điều kiện tiên quyết — trang web viết xong mà
   app chưa có CORS thì vẫn không gọi được API từ xa.
2. **W0 — nhập URL Tunnel (việc phía web, mới).** Quick tunnel **đổi URL mỗi
   lần mở app**, và trang ngoài không còn được app phục vụ nên không tự biết
   base URL. Cần 1 màn trước cả màn ghép nối:
   - Ô nhập URL Tunnel (dán từ app) + nút Kiểm tra.
   - Kiểm tra bằng `GET {base}/remote/health` (không cần token). Đạt thì
     lưu base rồi chuyển sang W1; sai/hết hạn thì báo rõ "không tới được
     máy tính, kiểm tra app đã mở + URL mới nhất".
   - Có nút "Đổi máy / đổi URL" ở màn ghép nối và trong phần cài đặt của
     shell để thay base mà không phải xoá tay localStorage.
   - Test local: base dạng `http://127.0.0.1:<port>` chỉ dùng khi chính trang
     cũng mở ở ngữ cảnh cho phép (trang `https://` gọi `http://127.0.0.1`
     có thể bị trình duyệt chặn mixed-content dù 127.0.0.1 là địa chỉ
     đáng tin — phải kiểm chứng trên trình duyệt thật khi code, không mặc
     định là chạy được). Đường chính thức luôn là URL Tunnel `https://`.
3. **WebSocket cross-origin.** `wss://<tunnel>/remote/live?token=...` đi
   được xuyên origin trừ khi server kiểm tra `Origin` — nếu app có check
   origin cho WS thì phải nới cho origin của trang web (ghi vào mục 10).
4. **Trang điều khiển không phải trang marketing.** Không đưa vào sitemap,
   đặt `<meta name="robots" content="noindex">`, không gắn header/footer
   của trang chủ, không analytics. URL Tunnel + token là thông tin nhạy
   cảm (mục 9) — không để lọt vào link chia sẻ hay log phía web.

## 3. Vị trí trong repo website (đề xuất, chờ chốt khi code)

- Thư mục `remote/` ở gốc repo, 3 file giữ đúng cấu trúc của WR-10 để port
  1-1 thay vì gộp: `remote/index.html`, `remote/app.css`, `remote/app.js`.
  Cloudflare Pages phục vụ tại `/remote/`.
- Lý do không gộp 1 file kiểu `index.html`/`account.html`: trang này là ứng
  dụng có trạng thái (WS, hàng đợi, chat), tách CSS/JS mới bảo trì được;
  và 3 file nguồn của WR-10 đã tách sẵn.
- `_headers` hiện chỉ cache dài cho `/assets/*`, `/css/*`, `/js/*` — thư mục
  `/remote/*` không dính các rule đó là đúng ý: file điều khiển không được
  cache immutable, tránh user giữ bản cũ sau mỗi lần sửa.
- Favicon dùng lại `favicon.ico` của site.

## 4. Luồng người dùng và máy trạng thái phiên

```
Mở /remote/
  │
  ├─ Chưa có base URL đã lưu ──────────────► W0 nhập URL Tunnel
  │                                            │ Kiểm tra /remote/health OK
  ├─ Có base, chưa có token ───────────────► W1 nhập tài khoản + mã ghép 6 số
  │                                            │ POST /remote/pair
  │                                            ├─ Sai mã → báo rõ, ở lại W1
  │                                            ├─ Chờ duyệt → poll
  │                                            │   /remote/pair/status mỗi 3s
  │                                            └─ Được duyệt → nhận token
  └─ Có base + token ──────────────────────► Shell 6 mục (mục 7)
                                                │
        401 (hết hạn / bị thu hồi / revoke) ────┴──► xoá token, về W1
        Socket đóng 4001 ─────────────────────────► xoá token, về W1
        Mất kết nối (app tắt) ────────────────────► giữ nguyên màn hình +
                                                     banner W6, tự nối lại
        Người thứ 2 ghép ─────────────────────────► bị chặn theo luật slot;
                                                     chỉ vào được sau khi máy
                                                     tính duyệt đổi phiên
```

- Token: 64 ký tự hex, lấy sau khi ghép, gửi kèm mọi API ở header
  `Authorization: Bearer <token>`.
- Các route không cần token: `/remote/health`, `/remote/pair`,
  `/remote/pair/status`, `/remote/session` (theo file nguồn).
- Phiên hết hạn: hiện đúng câu "phiên đã hết, ghép lại", không hiện lỗi kỹ
  thuật thô.

## 5. Hợp đồng API (giữ nguyên từ file nguồn)

Base = URL Tunnel (hoặc `http://127.0.0.1:<port>` khi test local, với lưu ý
mixed-content ở mục 2). Lỗi trả tiếng Việt dạng `{"error": "..."}` — trang
hiện nguyên văn câu lỗi của server, không tự dịch lại.

| Nhóm | Route | Ghi chú phía web |
|---|---|---|
| Hệ thống | `GET /remote/health` | W0 dùng kiểm tra base, không cần token |
| Ghép nối | `POST /remote/pair` | Gửi tài khoản + mã 6 số |
| Ghép nối | `GET /remote/pair/status` | Poll mỗi 3s khi chờ duyệt |
| Phiên | `GET /remote/session` | Không cần token |
| Phiên | `POST /remote/session/approve` | Duyệt đổi phiên |
| Phiên | `POST /remote/session/reject` | Từ chối đổi phiên |
| Trạng thái | `GET /remote/status` | Số liệu cho Dashboard W2 |
| Hàng đợi | `GET /remote/queue` | Danh sách job |
| Hàng đợi | `GET /remote/queue/{id}` | Chi tiết 1 job |
| Hàng đợi | `POST /remote/queue/{id}/cancel` | Nút Dừng |
| Hàng đợi | `POST /remote/queue/{id}/retry` | Nút Làm lại |
| Tạo task | `POST /remote/prompts` | Body `{"kind":"image"\|"video","prompt":"..."}` |
| Workflow | `GET /remote/workflows` | Danh sách |
| Workflow | `GET /remote/workflows/{id}` | Chi tiết + trạng thái từng bước |
| Workflow | `POST /remote/workflows/{id}/run` | Thao tác nhạy cảm (409) |
| Kho | `GET /remote/library` | Lọc Ảnh/Video/Nhạc, tìm theo tên |
| Kho | `GET /remote/library/{id}` | Chi tiết 1 item |
| Kho | `GET /remote/library/{id}/file` | Tải file gốc, truyền `?token=` |
| Kho | `GET /remote/library/{id}/thumbnail` | Ảnh xem trước, truyền `?token=` |
| Trợ lý | `POST /remote/assistant/chat` | Gửi tin trong thread đang mở |
| Trợ lý | `GET /remote/assistant/history` | Lịch sử thread |
| Trợ lý | `GET /remote/assistant/threads` | Danh sách thread |
| Drive | `GET /remote/drive/status` | Chưa connect thì dẫn tới bước connect |
| Drive | `POST /remote/drive/connect` | Device-flow: hiện mã + link google.com/device, tự poll |
| Drive | `GET /remote/drive/connect/status` | Poll trạng thái connect |
| Drive | `POST /remote/drive/disconnect` | Ngắt kết nối |
| Drive | `POST /remote/drive/config` | Nhập Client ID |
| Drive | `GET /remote/drive/files` | File app đã up (scope `drive.file`) |
| Drive | `POST /remote/drive/upload/{libraryId}` | Thao tác nhạy cảm (409) → hiện link share |

Quy tắc nghiệp vụ phía web phải giữ:

- **SIZE LẤY TỪ PROMPT:** `POST /remote/prompts` thiếu tỉ lệ `size 16:9` /
  `9:16` / `1:1` trong prompt thì server trả 400 — trang hiện rõ câu lỗi
  400 đó ngay tại form, không nuốt lỗi, không tự thêm size hộ user.
- **Xác nhận thao tác nhạy cảm (409):** chạy prompt đợt lớn, chạy workflow,
  up Drive — server trả `409 {needsConfirmation, summary, confirmToken}`
  trước. Trang hiện hộp xác nhận **1 lần** với câu `summary`, user đồng ý
  mới gửi lại kèm `confirmToken` (dùng 1 lần, hạn 10 phút, sai action/tài
  khoản thì vô hiệu). Hủy ở hộp xác nhận = không gửi gì thêm.
- **File/thumbnail qua `?token=`:** vì `<img>` và link tải không gắn được
  header `Authorization` — giữ nguyên cách này, không đổi sang fetch-blob.
- Mọi lệnh từ xa được app ghi AuditLog (`remote_cmd`) — phía web không cần
  làm gì thêm, nhưng không được tự retry lệnh ghi (trừ cơ chế 409 ở trên)
  để tránh lệnh trùng trong log.

## 6. WebSocket live

- Kết nối: `GET {base}/remote/live?token=...` (nâng cấp WS/WSS theo base).
- Ngay khi nối, server gửi tin `sync`: trạng thái app + hàng đợi đầy đủ +
  danh sách workflow + thread chat đang mở. Trang render từ `sync`, không
  tự gọi REST để dựng lại trạng thái ban đầu.
- Sự kiện server → client: `job.queued`, `job.running`, `job.progress`,
  `job.done`, `job.failed`, `job.cancelled`, `workflow.stage`,
  `assistant.reply`.
- Tin client → server: `ping`, `cancel`, `retry`, `prompt`, `runWorkflow`,
  `chat`. (Gửi lệnh qua WS hay qua REST theo đúng cách WR-10 đã làm — port
  giữ nguyên, không tự đổi kênh.)
- Đóng mã **4001** = hết hạn phiên: xoá token, về W1, báo "phiên đã hết".
- Mất kết nối thường: tự nối lại theo backoff tăng dần (đề xuất phía web:
  1s → 2s → 5s → 10s → tối đa 30s), đồng thời **poll REST mỗi 5s làm dự
  phòng** như W2 đã chốt; nối lại được thì chờ tin `sync` để đồng bộ,
  không cần refresh tay.

## 7. Spec responsive — điện thoại và máy tính

Bản nhúng WR-10 chỉ có layout điện thoại (6 tab dưới, nút ≥44px, dùng 1
tay). Bản web giữ nguyên trải nghiệm điện thoại đó và thêm layout máy tính.

### 7.1 Breakpoint

Site hiện dùng ngưỡng 760px cho các trang nội dung, nhưng trang remote là
bàn điều khiển nhiều cột (sidebar + nội dung + xem trước) nên siết ở 760px
sẽ chật. Spec này chốt 3 dải riêng cho remote:

| Dải | Tên | Điều hướng | Cột nội dung |
|---|---|---|---|
| `< 900px` | Điện thoại | Thanh 6 tab cố định **dưới cùng** | 1 cột |
| `900–1199px` | Màn nhỏ / tablet ngang | Sidebar **thu gọn** (icon + nhãn ngắn, ~200px) | 2 cột khi hợp |
| `≥ 1200px` | Máy tính | Sidebar **đầy đủ** (~240px) | Tối đa 1180px, lưới nhiều cột |

- Chiều cao thấp (laptop ngắn, điện thoại xoay ngang): nội dung cuộn trong
  vùng chính, sidebar/thanh tab và banner kết nối luôn cố định — không để
  nút điều khiển trôi khỏi màn hình.
- Không cuộn ngang ở bất kỳ dải nào; bảng rộng trên điện thoại phải biến
  thành thẻ xếp chồng (xem 7.3).

### 7.2 Khung (shell) và điều hướng 6 mục

6 mục điều hướng (tách W3 và W5 của file nguồn thành 2 mục mỗi nhóm cho đủ
6 tab như W6 đã chốt):

| # | Mục | Gồm | Nguồn |
|---|---|---|---|
| 1 | Tổng quan | Dashboard: 4 số + tiến trình + job/ hàng đợi | W2 |
| 2 | Tạo task | Form Ảnh/Video + prompt | W3 (phần prompt) |
| 3 | Workflow | Danh sách + chi tiết bước + nút Chạy | W3 (phần workflow) |
| 4 | Trợ lý | Chat AI | W4 |
| 5 | Kho | Thư viện kết quả | W5 (phần kho) |
| 6 | Drive | Trạng thái Drive + file Drive + up Drive | W5 (phần Drive) |

- **Điện thoại:** 6 tab dưới cùng, mỗi tab icon + nhãn ngắn, vùng chạm
  ≥44px, tab đang chọn có trạng thái rõ (không chỉ đổi màu mờ).
- **Máy tính:** sidebar trái cố định theo cùng thứ tự 1–6; đầu sidebar là
  tên app + trạng thái kết nối (chấm xanh/đỏ + chữ); cuối sidebar là thông
  tin phiên (tài khoản, máy đang giữ phiên) + nút ngắt/ghép lại.
- Chuyển mục **không tải lại trang, không mất** nội dung đang gõ (prompt,
  tin chat nháp) và không tự đóng WebSocket.
- Banner kết nối (W6): điện thoại nằm ngay trên thanh tab; máy tính nằm
  trên cùng vùng nội dung, full chiều ngang của vùng nội dung.

### 7.3 Từng màn theo dải

**W0 — Kết nối (màn mới)**
- Cả 2 nền tảng: form 1 cột, rộng tối đa ~480px, căn giữa; ô dán URL (tự
  nhận diện khi dán, tự cắt khoảng trắng thừa), nút Kiểm tra ≥44px.
- Máy tính: thêm ghi chú ngắn "URL lấy trong app: mục Remote/Tunnel" và
  vùng hiển thị URL đã lưu gần nhất để chọn lại thay vì dán mới.

**W1 — Ghép nối**
- Form tài khoản + 6 ô mã (hoặc 1 ô nhận 6 số, tự nhảy ô) — điện thoại mở
  bàn phím số; máy tính hỗ trợ dán mã 1 lần và Enter để gửi.
- Trạng thái chờ duyệt: hiện rõ "đang chờ duyệt trên máy tính…" + tự poll
  3s; có nút Hủy chờ. Ghép sai: báo lỗi của server ngay dưới form, không
  chuyển màn.

**W2 — Tổng quan**
- 4 số (đang chạy / chờ / xong / lỗi): điện thoại lưới 2×2; máy tính 4 thẻ
  ngang 1 hàng.
- Thanh tiến trình tổng luôn trên cùng khối job.
- Job đang chạy + hàng đợi: điện thoại = thẻ xếp chồng (tên, loại, tiến
  trình, nút Dừng/Làm lại ≥44px); máy tính = **bảng** (cột: Job, Loại,
  Trạng thái, Tiến trình, Thao tác) với nút nhỏ gọn hơn (≥36px) và hover
  rõ. Cùng dữ liệu, chỉ đổi cách trình bày bằng CSS theo breakpoint.
- Cập nhật live qua WS; WS đứt thì poll REST 5s (mục 6) — giao diện không
  đổi, chỉ hiện dấu hiệu "đang nối lại…" ở banner W6.

**W3 — Tạo task + Workflow**
- Tạo task: chọn Ảnh/Video dạng segmented control; ô prompt nhiều dòng.
  Điện thoại: form 1 cột, nút Gửi cuối form. Máy tính: form và "task vừa
  gửi / đang chạy của mục này" xếp **2 cột** (form trái ~55%, trạng thái
  phải), nút Gửi nằm trong cột form.
- Lỗi 400 thiếu size: hiện ngay dưới ô prompt, giữ nguyên nội dung đã gõ.
- Workflow: điện thoại = danh sách thẻ, mở chi tiết dạng trang con (có nút
  quay lại); máy tính = danh sách trái + chi tiết bước phải (master–detail),
  bước nào đang chạy/đã xong/lỗi có trạng thái riêng; nút Chạy qua hộp xác
  nhận 409 (mục 5).

**W4 — Trợ lý (chat)**
- Điện thoại: 1 cột — xem thread đang mở, khung nhập cố định trên thanh
  tab; danh sách thread (nếu chuyển) mở dạng trang con.
- Máy tính: **2 cột** — danh sách thread (~300px) + khung chat; khung nhập
  cố định dưới cột chat; tin nhắn có độ rộng tối đa dễ đọc (~70%).
- Hành động AI đề xuất phải hiện rõ nhãn "cần xác nhận trên máy tính, chưa
  chạy" ở cả 2 nền tảng — không trình bày như đã thực thi.

**W5 — Kho + Drive**
- Kho: thanh lọc (Ảnh/Video/Nhạc) + ô tìm theo tên dính trên cùng của mục.
  Lưới thumbnail: điện thoại 2 cột; 900–1199px: 3–4 cột; ≥1200px: 4–5 cột
  (theo bề rộng thật của vùng nội dung sau sidebar).
- Chi tiết item: điện thoại = trang con full màn hình; máy tính = hộp xem
  trước lớn (modal) gồm xem trước, thông tin, nút Tải file gốc (`?token=`)
  và nút Up Drive (qua xác nhận 409, xong thì hiện link share).
- Drive: trạng thái kết nối thành 1 khối riêng ở đầu mục Drive. Chưa
  connect: hiện bước connect (nhập Client ID → device-flow hiện mã + link
  `google.com/device` + tự poll). Đã connect: danh sách file Drive dạng
  bảng trên máy tính / thẻ trên điện thoại, nút Ngắt kết nối (hỏi xác nhận
  phía web trước khi gọi API).

### 7.4 Tương tác chuột / chạm / bàn phím

- Điện thoại giữ luật W6: mọi nút và tab ≥44px, thao tác chính trong tầm
  ngón cái (nửa dưới màn hình).
- Máy tính: mật độ gọn hơn được phép (nút ≥36px, hàng bảng ~44px) nhưng
  không nhỏ hơn mức bấm nhầm; có hover và focus-visible rõ cho điều hướng
  bàn phím; Enter gửi form ghép nối/chat, Esc đóng modal xem trước và hộp
  xác nhận.
- Không dùng hover làm cách duy nhất để lộ thao tác (điện thoại không có
  hover) — nút Dừng/Làm lại/Up Drive luôn nhìn thấy được.

### 7.5 Màu sắc và chữ

- Giữ ngôn ngữ hình ảnh của WR-10 (màu, bo góc, kiểu thẻ) để user không
  phải học lại — việc của đợt này là responsive + W0, **không thiết kế lại
  thương hiệu**. Nếu khi code thấy WR-10 dùng biến CSS thì giữ nguyên tên
  biến, chỉ thêm biến theo breakpoint.
- Chữ: tối thiểu 14px cho nội dung phụ, 16px cho ô nhập trên điện thoại
  (tránh iOS tự zoom khi focus).

## 8. Trạng thái và lỗi dùng chung

Mọi mục đều phải có đủ 4 trạng thái, ở cả 2 nền tảng:

- **Đang tải:** khung chờ (skeleton) đúng hình dạng nội dung thật, không
  nhảy layout khi dữ liệu về (cùng tinh thần "chuyển tab không nhảy" đã
  áp cho các app của user).
- **Rỗng:** câu nói rõ đang trống + hành động gợi ý (ví dụ Kho trống →
  "chưa có kết quả nào, tạo task ở mục Tạo task").
- **Lỗi API:** hiện câu `error` tiếng Việt của server + nút Thử lại.
- **Mất kết nối (W6):** banner "không kết nối được tới máy tính — kiểm tra
  app đã mở và URL Tunnel còn đúng" + tự nối lại (mục 6); dữ liệu cũ giữ
  nguyên trên màn hình, đóng băng tương tác ghi (nút bấm bị khóa kèm lý
  do) thay vì để bấm rồi lỗi.

## 9. Lưu trữ phía web và bảo mật

- Chỉ lưu 2 khóa trong `localStorage` của origin trang web (tên đề xuất
  khi code: `hora.remote.baseUrl`, `hora.remote.token`). Không lưu mã ghép
  6 số, không lưu nội dung prompt/chat.
- Nhận 401 hoặc đóng WS 4001 → xoá **token** ngay; giữ base URL để ghép
  lại nhanh, trừ khi user tự chọn "Đổi máy / đổi URL".
- URL Tunnel coi như thông tin nhạy cảm: không đưa vào URL của trang web
  (không query `?tunnel=`), không gửi đi nơi khác, không ghi log phía web.
- Trang mở công khai ai cũng vào được màn W0/W1 là chấp nhận được vì còn
  2 lớp sau: biết URL Tunnel **và** mã ghép 6 số + duyệt trên máy tính.
  Không nới thêm lớp nào ở phía web (không tự sinh mã, không bỏ bước
  duyệt).

## 10. Yêu cầu phía app (ngoài repo website — làm ở máy local)

Chưa kiểm chứng được từ VM (code app chỉ ở máy local của user). Khi code
phía web bắt đầu, phía app cần kiểm tra/bổ sung:

- [ ] CORS cho API REST: trả `Access-Control-Allow-Origin` cho origin của
      trang web (`https://hora.works`; thêm origin dev nếu cần test),
      cho phép header `Authorization`, `Content-Type` và xử lý preflight
      `OPTIONS` cho các route `/remote/*`.
- [ ] WebSocket `/remote/live`: nếu có kiểm tra `Origin` thì cho phép
      origin của trang web.
- [ ] Xác nhận `GET /remote/health` gọi cross-origin được từ W0 (nó là
      bước kiểm tra đầu tiên, hỏng bước này là kẹt toàn bộ luồng).
- [ ] Giữ nguyên trang nhúng WR-10 (dự phòng same-origin khi CORS/tunnel
      có sự cố).

## 11. Dữ liệu còn thiếu — phải có trước khi code

File nguồn ghi route nhưng **không ghi shape JSON trả về**. Không đoán
field. Cần lấy từ bản WR-10 đang chạy (ưu tiên) hoặc từ app:

- 3 file `src/HORA.Video/Services/Remote/Web/index.html`, `app.css`,
  `app.js` — chứa đủ cách đọc field, dựng `sync`, xử lý 409 và reconnect
  đã nghiệm thu. Có 3 file này thì việc code là *port + responsive + W0*;
  không có thì phải viết lại mò theo route, rủi ro lệch field rất cao.
- Nếu không tiện gửi file: cần JSON mẫu thật (đã xoá token/thông tin nhạy
  cảm) của: `/remote/status`, `/remote/queue`, `/remote/workflows`,
  `/remote/workflows/{id}`, `/remote/library`, tin WS `sync`,
  `/remote/assistant/threads`, `/remote/drive/status`, `/remote/session`.

## 12. Kế hoạch triển khai khi được duyệt code (tham chiếu)

- **R1 — Port khung:** dựng `remote/` 3 file từ WR-10, chạy same-origin
  qua tunnel để đối chiếu hành vi gốc (chưa responsive, chưa W0).
- **R2 — W0 + CORS:** thêm màn nhập URL Tunnel + lưu base; phía app bật
  CORS (mục 10); kiểm chứng luồng W0 → W1 → shell qua `hora.works/remote/`
  trên điện thoại 4G.
- **R3 — Responsive:** shell sidebar/thanh tab theo mục 7.1, từng mục theo
  7.3; kiểm ở các bề rộng ở mục 13 bằng trình duyệt thật (đo layout, chụp
  từng mục) trước khi báo xong.
- **R4 — Nghiệm thu đầy đủ:** chạy checklist mục 13 trên điện thoại thật
  qua 4G + máy tính thật, ghi lại bảng số (lượt gọi, băng thông, độ trễ).

## 13. Checklist nghiệm thu

Từ file nguồn (điện thoại thật qua 4G):

- [ ] Mở link 4G → ghép mã → vào trang điều khiển.
- [ ] Chạy task + workflow từ điện thoại, tiến trình chạy live.
- [ ] Chat AI từ điện thoại, nhận report lại.
- [ ] Lấy link gốc / up Drive được sau khi job xong.
- [ ] Connect Drive được từ trang remote; xem file Drive, upload kết quả,
      lấy link share.
- [ ] Máy thứ 2 ghép → bị chặn; duyệt đổi phiên trên máy tính → máy mới
      vào được.
- [ ] Revoke → đứt ngay.
- [ ] Bảng số thật (lượt gọi, băng thông, độ trễ) đã đo và ghi lại.

Bổ sung cho bản web responsive:

- [ ] W0: dán URL Tunnel sai/hết hạn → báo rõ; URL đúng → qua W1; mở lại
      trang → nhớ URL, không phải dán lại.
- [ ] CORS: toàn bộ luồng chạy từ origin `https://hora.works`, không lỗi
      console về CORS ở bất kỳ route nào (kể cả preflight của POST có
      `Authorization`).
- [ ] Kiểm layout ở bề rộng 360, 390, 768, 1024, 1280, 1440px: đúng dải
      của mục 7.1, không cuộn ngang, tab/sidebar không che nội dung.
- [ ] Máy tính: đủ 6 mục ở sidebar; Tổng quan dạng bảng; Chat 2 cột; Kho
      mở xem trước dạng modal; Esc đóng được modal và hộp xác nhận 409.
- [ ] Điện thoại: 6 tab dưới ≥44px; chuyển mục không mất prompt/chat đang
      gõ; bàn phím số hiện khi nhập mã ghép.
- [ ] Đang dùng thì tắt app → banner W6 hiện, nút ghi bị khóa; mở lại app
      → tự nối lại và đồng bộ bằng tin `sync`, không refresh tay.
- [ ] Hết phiên (401/4001) → về W1 với câu "phiên đã hết, ghép lại", token
      cũ đã bị xoá khỏi localStorage.

## 14. Điểm chưa chốt

Từ file nguồn:

- URL ổn định (named tunnel) hay giữ quick tunnel đổi mỗi lần mở app?
  (Giữ quick tunnel thì W0 là bước bắt buộc mỗi lần đổi URL; có named
  tunnel thì W0 gần như chỉ làm 1 lần.)
- Drive xem toàn bộ (`drive.readonly`) hay giữ `drive.file` (chỉ file app
  up)? — spec này viết theo `drive.file` như hiện tại.
- Bot Telegram báo thêm gì ngoài "job xong / job lỗi"?
- Đổi máy miễn phí không giới hạn, hay giới hạn 2–3 máy tin cậy / số lần
  đổi mỗi ngày?

Phát sinh khi mang ra web:

- Chốt vị trí `hora.works/remote/` + cấu trúc 3 file ở mục 3 khi bắt đầu
  code (spec đang đề xuất hướng này).
- CORS allowlist: chỉ `https://hora.works` hay thêm origin dự phòng
  (subdomain `remote.hora.works`)? — đề xuất: chỉ 1 origin chính để bề mặt
  tấn công nhỏ nhất.
- Có giữ trang nhúng WR-10 vĩnh viễn làm dự phòng không, hay gỡ sau khi
  bản web ổn định? — đề xuất: giữ, chi phí gần như bằng không.

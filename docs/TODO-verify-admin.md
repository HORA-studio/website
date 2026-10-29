# TODO — Verify HORA.Admin sau khi đổi nguồn license

Trạng thái: chưa verify (cần admin token). Repo liên quan: `~/HORA/hora-worker` (worker core).

## Bối cảnh

License của Video Builder đã dời từ D1 `hora-vb` sang `hora-website`. Worker core
bind `DB_VB` → `hora-website` (đã deploy). Cần xác nhận HORA.Admin đọc đúng dữ
liệu mới và đường cấp license tay đã bị chặn.

## Chuẩn bị

1. Lấy **admin token**: đăng nhập HORA.Admin (hoặc `POST /api/admin/auth/login`
   với user `admin` / mật khẩu admin). Token là JWT Bearer.
   - Nếu chưa biết mật khẩu: xem `scripts/create-superadmin.mjs` hoặc reset qua seed.
2. Đặt biến: `TOKEN=<jwt>`.

## Checklist verify (curl)

### 1. Admin đọc được license từ DB mới
```bash
curl -s https://api.hora.works/api/admin/licenses -H "Authorization: Bearer $TOKEN" \
  | python3 -m json.tool
```
- [ ] Thấy **4 license** Video Builder (tier `plus`, prefix `VBB_`) — đúng số đã migrate.
- [ ] Không còn license nào từ `hora-vb` cũ (DB đã xoá).

### 2. Tìm kiếm / chi tiết
```bash
curl -s "https://api.hora.works/api/admin/licenses/search?q=VBB_" -H "Authorization: Bearer $TOKEN"
curl -s "https://api.hora.works/api/admin/licenses/17ae5e07bf3ee3be94a46f9dbaba01dd" -H "Authorization: Bearer $TOKEN"
```
- [ ] `search` trả về license khớp.
- [ ] `detail` hiện `deviceCount`, `issuedBy`, `organization`.

### 3. Cấp license tay ĐÃ BỊ CHẶN (410)
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.hora.works/api/admin/licenses \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"contractVersion":1,"productId":"video-builder","tier":"go","validityDays":30}'
```
- [ ] Trả **410** + `LICENSE_ISSUE_DISABLED`.
- [ ] `POST /api/admin/licenses/batch` cũng 410.

### 4. Plans / devices (đọc từ DB mới)
```bash
curl -s https://api.hora.works/api/admin/video-builder/plans -H "Authorization: Bearer $TOKEN"
curl -s "https://api.hora.works/api/admin/video-builder/devices?licenseId=17ae5e07bf3ee3be94a46f9dbaba01dd" -H "Authorization: Bearer $TOKEN"
```
- [ ] `plans` trả 3 gói (go/plus/pro) — đã migrate.
- [ ] `devices` hiện device đang bind (nếu license đó có).

### 5. Revoke / restore (ghi vào DB mới)
- [ ] `POST /api/admin/licenses/<id>/revoke` → 204; license chuyển `revoked`.
- [ ] Kiểm tra app bootstrap license đó → `licenseValid:false`.
- [ ] `POST /api/admin/licenses/<id>/restore` → về active.

### 6. (Tùy chọn) Kiểm chứng event ledger
- [ ] `/api/admin/events` vẫn trả event (DB `hora-vb-events` chưa đụng).

## Kết quả mong đợi

Nếu tất cả pass: HORA.Admin hoạt động đúng với nguồn license mới; chỉ mất chức
năng **cấp license tay** (đã chủ đích bỏ — license sinh từ mua web / claim).

## Nếu FAIL

- **Không thấy license**: kiểm tra binding `DB_VB` của worker core đã trỏ
  `hora-website` chưa (`wrangler.core.toml` + đã deploy).
- **Lỗi 500 khi list**: có thể do cột schema lệch — so `pragma_table_info('licenses')`
  với schema web.
- **Vẫn cấp được license (không 410)**: code `handlers/core.ts` chưa lên — deploy lại core.

## Ghi chú

- Admin token không nằm trong repo/chat — lấy từ app hoặc biến môi trường.
- Token Cloudflare `~/.hora_cloudflare_token` thiếu quyền Workers; deploy cần
  `~/.cloudflare-token`.

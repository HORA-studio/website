-- HORA website — D1 "hora-website-events": nhat ky hanh vi (append-only).
-- Tach RIENG khoi DB nghiep vu (hora-website) de:
--   - deploy/hong UI khong dung tới log;
--   - bang log phinh to khong lam cham query customers/orders;
--   - co the archive/xoa dinh ky ma khong dung du lieu that.
-- Ap dung: npx wrangler d1 execute hora-website-events --remote --file db/schema-events.sql
-- Ghi log PHAI fail-open: loi ghi log khong duoc lam vo request (xem functions/api/_log.js).

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,     -- vd 'auth.register', 'order.create', 'identity.link_claim'
  customer_id TEXT,              -- admin/customer id neu biet (KHONG rang buoc FK — DB rieng)
  actor       TEXT,              -- nguon: 'web' | 'app' | 'sepay' | ...
  details     TEXT,              -- JSON ngan gon (da loc, KHONG chua mat khau/token tho)
  ip          TEXT,
  device_id   TEXT,
  created_at  TEXT NOT NULL,
  day         TEXT NOT NULL,     -- YYYY-MM-DD (de group theo ngay)
  meta        TEXT               -- JSON tuy y cho truong hop dac biet
);
CREATE INDEX IF NOT EXISTS idx_events_type_day ON events(event_type, day);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);

-- Tong hop theo ngay (tuy chon — de dashboard nhanh, tranh COUNT tren bang lon).
CREATE TABLE IF NOT EXISTS event_daily (
  day        TEXT NOT NULL,
  event_type TEXT NOT NULL,
  count      INTEGER NOT NULL,
  PRIMARY KEY (day, event_type)
);

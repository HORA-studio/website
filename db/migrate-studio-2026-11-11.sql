-- HORA Studio (gen anh/video) — migration 2026-11-11, nhanh feature/ai-studio.
-- Ap dung: npx wrangler d1 execute hora-website --remote --file db/migrate-studio-2026-11-11.sql
-- (chay --local truoc khi test). Moi lenh idempotent (IF NOT EXISTS).
-- Mau flow: ShrimpReel — so cai credit chi ghi them, ket qua gen giu 30 ngay.

-- So cai credit cua Studio: so du = SUM(amount) theo customer.
-- reason: 'purchase' (mua goi) | 'spend' (tao) | 'refund' (gen loi hoan) |
--         'grant' (tang/admin) | 'redeem' (doi ma)
CREATE TABLE IF NOT EXISTS studio_credit_ledger (
  id            TEXT PRIMARY KEY,       -- led_<time36><random>
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  amount        INTEGER NOT NULL,       -- duong = cong, am = tru
  reason        TEXT NOT NULL,
  ref_id        TEXT,                   -- order id / generation id / ma redeem
  label         TEXT,                   -- mo ta hien cho khach
  balance_after INTEGER NOT NULL,       -- so du ngay sau dong nay (de doi soat)
  created_at    TEXT NOT NULL           -- ISO 8601 UTC
);
CREATE INDEX IF NOT EXISTS idx_studio_ledger_customer ON studio_credit_ledger(customer_id, created_at);

-- Mot lan gen (anh hoac video). File that o R2 (result_key), DB giu metadata.
-- status: queued -> processing -> done | failed | expired
CREATE TABLE IF NOT EXISTS studio_generations (
  id           TEXT PRIMARY KEY,        -- gen_<time36><random>
  customer_id  TEXT NOT NULL REFERENCES customers(id),
  kind         TEXT NOT NULL,           -- 'image' | 'video'
  prompt       TEXT NOT NULL,
  model        TEXT NOT NULL,           -- id model, vd 'kling-2-6'
  model_name   TEXT NOT NULL,           -- ten hien thi tai thoi diem tao
  params_json  TEXT,                    -- {ratio, duration, sourceKey}
  status       TEXT NOT NULL DEFAULT 'queued',
  credit_cost  INTEGER NOT NULL,
  provider_job TEXT,                    -- job id cua provider (fal/Dreamina) khi worker da gui
  result_key   TEXT,                    -- khoa file ket qua trong R2 STUDIO_MEDIA
  result_url   TEXT,                    -- URL doc ket qua (signed/proxy) khi done
  error        TEXT,
  created_at   TEXT NOT NULL,           -- ISO 8601 UTC
  completed_at TEXT,
  expires_at   TEXT NOT NULL            -- created_at + 30 ngay; cron don file + danh dau expired
);
CREATE INDEX IF NOT EXISTS idx_studio_gen_customer ON studio_generations(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_gen_status ON studio_generations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_gen_expires ON studio_generations(expires_at);

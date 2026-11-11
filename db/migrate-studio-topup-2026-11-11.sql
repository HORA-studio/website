-- Studio: phien nap credit qua chuyen khoan SePay (tu dong cong credit).
-- POST /api/studio/topup tao dong 'pending' kem ma rieng (code) de khach ghi
-- vao noi dung chuyen khoan; webhook SePay khop code + dung so tien thi
-- chuyen 'paid' va cong credit vao studio_credit_ledger (reason 'topup').
CREATE TABLE IF NOT EXISTS studio_topups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  pack TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  gateway_trans_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_studio_topups_customer ON studio_topups(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_topups_status ON studio_topups(status, created_at);

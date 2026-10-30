-- Khuyen mai (xem functions/api/_promo.js): orders ghi lai so ngay duoc
-- cong them khi cap license. Cau hinh khuyen mai nam o bang meta (da co
-- san) key 'promotion' — khong can them bang/cot nao khac.
-- AN TOAN chay lai: neu cot da co, lenh se bao loi "duplicate column" —
-- bo qua loi do la duoc.
ALTER TABLE orders ADD COLUMN bonus_days INTEGER NOT NULL DEFAULT 0;

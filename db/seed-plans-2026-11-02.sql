-- Seed bang plans cho app Video Builder trong D1 "hora-website".
-- Ap dung: npx wrangler d1 execute hora-website --remote --file db/seed-plans-2026-11-02.sql
--
-- VI SAO: /api/app/bootstrap tra maxConcurrentVideoJobs bang cach doc plans
-- (quota_json.videoConcurrency) thay vi hardcode trong code. Bang plans co the
-- con thieu tier trong DB hop nhat -> bootstrap fail-soft ve mac dinh trong code.
-- Gia tri duoi day khop FACEBOOK/VB defaults trong hora-worker/src/domain/plans.ts
-- va schema/seed-vb.sql (go 10 / plus 30 / pro 50). Idempotent (INSERT OR REPLACE).
INSERT OR REPLACE INTO plans (app, tier, name, quota_json) VALUES
  ('video-builder', 'go',   'go',   '{"tier":"go","accounts":10,"imageConcurrency":10,"videoConcurrency":10,"recheckAfterSeconds":86400}'),
  ('video-builder', 'plus', 'plus', '{"tier":"plus","accounts":50,"imageConcurrency":30,"videoConcurrency":30,"recheckAfterSeconds":86400}'),
  ('video-builder', 'pro',  'pro',  '{"tier":"pro","accounts":50,"imageConcurrency":50,"videoConcurrency":50,"recheckAfterSeconds":86400}');

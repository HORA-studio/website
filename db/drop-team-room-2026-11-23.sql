-- Xoa phong chung cu (team room) khoi D1 hora-website — lenh bo 23/11/2026.
-- Code da go tu commit c519efd (13/11): xoa team.html + functions/api/team (8 file).
-- File nay xoa not 4 bang team_* trong D1 hora-website.
-- Chay 1 lan tren Cloudflare: D1 > hora-website > Console, dan toan bo file nay.
-- Sau khi chay, /api/team/* khong con code de goi, bang cung khong con — het request spam.
DROP TABLE IF EXISTS team_messages;
DROP TABLE IF EXISTS team_access_log;
DROP TABLE IF EXISTS team_sessions;
DROP TABLE IF EXISTS team_members;

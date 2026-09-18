-- 0001_init.sql: NodePulse initial D1 schema

-- 服务器
CREATE TABLE IF NOT EXISTS servers (
  id            TEXT PRIMARY KEY,              -- 12 位随机 base32，不可枚举
  name          TEXT NOT NULL,
  group_id      TEXT REFERENCES groups(id),
  token_hash    BLOB NOT NULL,                 -- HMAC-SHA256(TOKEN_PEPPER, secret)
  token_prefix  TEXT NOT NULL,                 -- 前 6 位，仅用于后台展示识别
  note          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  public        INTEGER NOT NULL DEFAULT 0,    -- 公开模式下是否可见
  geo_lat       REAL, geo_lng REAL, geo_label TEXT, country TEXT,   -- 大屏地图
  traffic_quota_bytes INTEGER, traffic_reset_day INTEGER, traffic_direction TEXT, -- 月流量
  interval_s    INTEGER NOT NULL DEFAULT 10,
  created_at    INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);

-- 身份
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT,
                    role TEXT NOT NULL CHECK(role IN ('admin')), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  credential_id BLOB UNIQUE NOT NULL, public_key BLOB NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT, aaguid TEXT, backed_up INTEGER, name TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,                    -- SHA-256(session_id)
  user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL, ip_hash TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS view_tokens (                     -- 只读分享 / 大屏令牌
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  scope TEXT NOT NULL,                         -- JSON: {groups:[], servers:[], fields:'public'|'full'}
  created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER, last_used_at INTEGER
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (id TEXT PRIMARY KEY, challenge BLOB NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL);

-- 告警
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  metric TEXT NOT NULL,                        -- cpu|mem|swap|disk|load1|net_in|net_out|offline|traffic_cycle
  op TEXT NOT NULL, threshold REAL NOT NULL, duration_s INTEGER NOT NULL DEFAULT 300,
  server_filter TEXT NOT NULL DEFAULT '{}',    -- JSON: {groups:[], servers:[], all:true}
  channels TEXT NOT NULL DEFAULT '[]',         -- JSON: channel ids
  severity TEXT NOT NULL DEFAULT 'warning', cooldown_s INTEGER NOT NULL DEFAULT 1800,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notify_channels (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
                              config_enc BLOB NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alert_events (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, server_id TEXT NOT NULL, severity TEXT NOT NULL,
                           state TEXT NOT NULL, value REAL, started_at INTEGER NOT NULL, resolved_at INTEGER,
                           notified INTEGER NOT NULL DEFAULT 0);

-- 汇总（冷数据）
CREATE TABLE IF NOT EXISTS metrics_1h (
  server_id TEXT NOT NULL, ts INTEGER NOT NULL,   -- 小时起点（秒）
  cpu_avg REAL, cpu_max REAL, mem_avg REAL, mem_max REAL, swap_avg REAL, disk_avg REAL,
  load1_avg REAL, load1_max REAL, net_in_avg REAL, net_in_max REAL, net_out_avg REAL, net_out_max REAL,
  rx_bytes INTEGER, tx_bytes INTEGER, tcp_avg REAL, udp_avg REAL, proc_avg REAL, samples INTEGER,
  PRIMARY KEY (server_id, ts)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS metrics_1d (
  server_id TEXT NOT NULL, ts INTEGER NOT NULL,
  cpu_avg REAL, cpu_max REAL, mem_avg REAL, mem_max REAL, swap_avg REAL, disk_avg REAL,
  load1_avg REAL, load1_max REAL, net_in_avg REAL, net_in_max REAL, net_out_avg REAL, net_out_max REAL,
  rx_bytes INTEGER, tx_bytes INTEGER, tcp_avg REAL, udp_avg REAL, proc_avg REAL, samples INTEGER,
  PRIMARY KEY (server_id, ts)
) WITHOUT ROWID;

-- 审计与设置
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT,
                        action TEXT NOT NULL, target TEXT, details TEXT, ip_hash TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

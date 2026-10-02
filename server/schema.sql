-- Leaderboard tables. Run once in phpMyAdmin (cPanel → Databases → phpMyAdmin → SQL tab).

-- One row per player per board. A board is a kind + mode + category + period:
--   daily:  category 'everyone', period = the UTC date ('2026-10-01'), one try per player
--   random: period 'all', keeps each player's best score
CREATE TABLE IF NOT EXISTS scores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  mode VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  period VARCHAR(10) NOT NULL,
  player CHAR(32) NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  score SMALLINT UNSIGNED NOT NULL,
  correct TINYINT UNSIGNED NOT NULL,
  achieved_at DATETIME NOT NULL,
  UNIQUE KEY board_player (kind, mode, category, period, player),
  KEY board_rank (kind, mode, category, period, score, achieved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recent submissions per (hashed) IP address, for rate limiting. Old rows are pruned automatically.
CREATE TABLE IF NOT EXISTS submissions (
  ip_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY ip_time (ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;

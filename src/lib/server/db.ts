import mysql from "mysql2/promise";

// 创建MySQL连接
export const pool = mysql.createPool({
	host: process.env.MYSQL_HOST || "localhost",
	user: process.env.MYSQL_USER || "root",
	password: process.env.MYSQL_PASSWORD || "",
	port: parseInt(process.env.MYSQL_PORT || "3307"),
	database: process.env.MYSQL_DATABASE || "webui_chat",
	charset: "utf8mb4",
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

// 初始化数据库表
pool
	.execute(
		`CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT '',
  avatar LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_username (username)
)`
	)
	.catch((err) => console.error("users table init error:", err));

// 为已有 users 表补充各列（MySQL 8 + mysql2 可链式执行多条 ALTER）
pool.execute(`ALTER TABLE users ADD COLUMN avatar LONGTEXT`).catch(() => {});
pool.execute(`ALTER TABLE users ADD COLUMN system_avatar LONGTEXT`).catch(() => {});
pool.execute(`ALTER TABLE users ADD COLUMN settings JSON`).catch(() => {});
pool.execute(
	`ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
).catch(() => {});

pool.execute(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NOT NULL`).catch(() => {});

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS chats (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  title VARCHAR(255) DEFAULT 'New Chat',
  models JSON,
  options JSON,
  messages JSON,
  history JSON,
  \`system\` TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (username),
  INDEX idx_timestamp (timestamp)
)`
	)
	.catch((err) => console.error("chats table init error:", err));

// 将 timestamp 列从 BIGINT 迁移为 DATETIME
pool
	.execute(
		`UPDATE chats SET timestamp = FROM_UNIXTIME(timestamp / 1000) WHERE timestamp > 1000000000000`
	)
	.catch(() => {});
pool.execute(`ALTER TABLE chats MODIFY COLUMN timestamp DATETIME NOT NULL`).catch(() => {});

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS feedback_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`
	)
	.catch((err) => console.error("feedback_table init error:", err));

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS advice_table (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`
	)
	.catch((err) => console.error("advice_table init error:", err));

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS api_providers (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  models JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_providers_username (username)
)`
	)
	.catch((err) => console.error("api_providers table init error:", err));

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS mood_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  mood_date DATE NOT NULL,
  mood VARCHAR(50) NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mood_username (username),
  UNIQUE KEY uk_user_date (username, mood_date)
)`
	)
	.catch((err) => console.error("mood_history table init error:", err));

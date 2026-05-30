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

// 为已有 users 表补充 avatar 列
pool.execute(`ALTER TABLE users ADD COLUMN avatar LONGTEXT`).catch(() => {});

// 为已有 users 表补充 system_avatar 列
pool.execute(`ALTER TABLE users ADD COLUMN system_avatar LONGTEXT`).catch(() => {});

// 将 password 列从 INT 改为 VARCHAR(255) 以支持 bcrypt 哈希
pool.execute(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NOT NULL`).catch(() => {});

// 为已有 users 表补充 settings 列（用户设置 JSON）
pool.execute(`ALTER TABLE users ADD COLUMN settings JSON`).catch(() => {});

// 为已有 users 表补充 created_at 列
pool
	.execute(`ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
	.catch(() => {});

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

// 知识库
pool
	.execute(
		`CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  embedding_model VARCHAR(255) DEFAULT 'nomic-embed-text',
  chunk_size INT DEFAULT 500,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kb_username (username)
)`
	)
	.catch((err) => console.error("knowledge_bases table init error:", err));

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS kb_documents (
  id VARCHAR(36) PRIMARY KEY,
  kb_id VARCHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  source_type VARCHAR(255),
  source_data LONGTEXT,
  status VARCHAR(20) DEFAULT 'pending',
  chunk_count INT DEFAULT 0,
  error_message TEXT,
  processed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kb_docs_kbid (kb_id)
)`
	)
	.catch((err) => console.error("kb_documents table init error:", err));

pool.execute(`ALTER TABLE kb_documents ADD COLUMN source_type VARCHAR(255)`).catch(() => {});
pool.execute(`ALTER TABLE kb_documents ADD COLUMN source_data LONGTEXT`).catch(() => {});
pool.execute(`ALTER TABLE kb_documents ADD COLUMN processed_at DATETIME`).catch(() => {});

pool
	.execute(
		`CREATE TABLE IF NOT EXISTS kb_chunks (
  id VARCHAR(36) PRIMARY KEY,
  doc_id VARCHAR(36) NOT NULL,
  kb_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chunks_doc (doc_id),
  INDEX idx_chunks_kb (kb_id)
)`
	)
	.catch((err) => console.error("kb_chunks table init error:", err));
